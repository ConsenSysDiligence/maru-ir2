import {
    Assignment,
    BoolType,
    Branch,
    Expression,
    FunctionCall,
    FunctionDefinition,
    Identifier,
    IntType,
    Jump,
    LoadField,
    LoadIndex,
    NoSrc,
    PointerType,
    Return,
    Statement,
    StoreField,
    StoreIndex,
    TransactionCall,
    Type
} from "../ir";
import { CFG } from "../ir/cfg";
import { Node } from "../ir/node";
import { Resolving, Typing } from "../passes";
import { pp, zip } from "../utils";
import { ExprEvaluator, fits, InterpError } from "./expression";
import { ComplexValue, Frame, PointerVal, PrimitiveValue, State } from "./state";

export class StatementExecutor {
    evaluator: ExprEvaluator;

    constructor(
        private readonly resolving: Resolving,
        private readonly typing: Typing,
        private readonly state: State
    ) {
        this.evaluator = new ExprEvaluator(typing, state);
    }

    private error(msg: string, e?: Node): never {
        throw new InterpError(e === undefined ? new NoSrc() : e, msg, this.state);
    }

    agrees(val: PrimitiveValue, type: Type): boolean {
        if (type instanceof BoolType && typeof val === "boolean") {
            return true;
        }

        if (type instanceof PointerType && val instanceof Array) {
            /// @todo (dimo): It would be a good guard against interp bugs here
            /// to check that the computed pointer region matches the type pointer region.
            /// However this requires carrying forward memory polymorphic substitutions through
            /// the interpreter. Ad this later on.
            return true;
        }

        if (type instanceof IntType && typeof val === "bigint" && fits(val, type)) {
            return true;
        }

        return false;
    }

    execAssignment(s: Assignment): void {
        const rVal = this.evaluator.evalExpression(s.rhs);
        this.assignTo(rVal, s.lhs, s);
        this.state.curFrame.curBBInd++;
    }

    execBranch(s: Branch): void {
        const condVal = this.evaluator.evalExpression(s.condition);

        if (!(typeof condVal === "boolean")) {
            this.error(`Branch expected boolean condition not ${condVal}`, s);
        }

        const label = condVal ? s.trueLabel : s.falseLabel;
        const newBB = (this.state.curFrame.fun.body as CFG).nodes.get(label);

        if (!newBB) {
            this.error(`No BasicBlock found for label ${label}`, s);
        }

        this.state.curFrame.curBB = newBB;
        this.state.curFrame.curBBInd = 0;
    }

    execFunctionCall(s: FunctionCall): void {
        const callee = this.resolving.getIdDecl(s.callee);

        if (!(callee instanceof FunctionDefinition)) {
            this.error(`Expected ${s.callee.pp()} to be a function`, s);
        }

        const argVs = s.args.map((expr) => this.evaluator.evalExpression(expr));

        const newFrame = new Frame(
            callee,
            zip(
                callee.parameters.map((d) => d.name),
                argVs
            )
        );

        this.state.stack.push(newFrame);
    }

    execJump(s: Jump): void {
        const newBB = (this.state.curFrame.fun.body as CFG).nodes.get(s.label);

        if (!newBB) {
            this.error(`No BasicBlock found for label ${s.label}`, s);
        }

        this.state.curFrame.curBB = newBB;
        this.state.curFrame.curBBInd = 0;
    }

    private assignTo(val: PrimitiveValue, lhs: Identifier, inStmt: Statement): void {
        const lhsType = this.typing.typeOf(lhs);

        if (lhsType === undefined) {
            this.error(`Missing type for ${lhs.pp()}`, lhs);
        }

        if (!this.agrees(val, lhsType)) {
            this.error(`Cannot assign ${pp(val)} to ${lhs.pp()} of type ${lhsType.pp()}`, inStmt);
        }

        this.state.curFrame.store.set(lhs.name, val);
    }

    private deref(val: PointerVal, e?: Expression): ComplexValue {
        const mem = this.state.memories.get(val[0]);

        if (mem === undefined) {
            this.error(`Memory ${val[0]} not found.`, e);
        }

        const loadedVal = mem.get(val[1]);

        if (loadedVal === undefined) {
            this.error(`Pointer ${val[1]} in ${val[0]} is undefined.`, e);
        }

        return loadedVal;
    }

    private evalAndDeref(e: Expression): ComplexValue {
        const val = this.evaluator.evalExpression(e);

        if (!(val instanceof Array)) {
            this.error(`Expected a pointer for ${e.pp()} not ${val}`, e);
        }

        return this.deref(val, e);
    }

    execLoadField(s: LoadField): void {
        const struct = this.evalAndDeref(s.baseExpr);

        if (!(struct instanceof Map)) {
            this.error(
                `Expected struct for ${s.baseExpr.pp()} instead of ${pp(struct)}`,
                s.baseExpr
            );
        }

        const val = struct.get(s.member);

        if (val === undefined) {
            this.error(`Struct missing field ${s.member}`, s);
        }

        this.assignTo(val, s.lhs, s);
        this.state.curFrame.curBBInd++;
    }

    execLoadIndex(s: LoadIndex): void {
        const array = this.evalAndDeref(s.baseExpr);
        const index = this.evaluator.evalExpression(s.indexExpr);

        if (!(array instanceof Array)) {
            this.error(
                `Expected struct for ${s.baseExpr.pp()} instead of ${pp(array)}`,
                s.baseExpr
            );
        }

        if (!(typeof index === "bigint")) {
            this.error(
                `Expected index ${s.baseExpr.pp()} to be a number not ${pp(index)}`,
                s.indexExpr
            );
        }

        if (index >= BigInt(array.length) || index < 0n) {
            this.error(`Index ${index} OoB.`, s);
        }

        const val = array[Number(index)];

        this.assignTo(val, s.lhs, s);
        this.state.curFrame.curBBInd++;
    }

    execStoreField(s: StoreField): void {
        const struct = this.evalAndDeref(s.baseExpr);

        if (!(struct instanceof Map)) {
            this.error(
                `Expected struct for ${s.baseExpr.pp()} instead of ${pp(struct)}`,
                s.baseExpr
            );
        }

        const rVal = this.evaluator.evalExpression(s.rhs);

        struct.set(s.member, rVal);
        this.state.curFrame.curBBInd++;
    }

    execStoreIndex(s: StoreIndex): void {
        const array = this.evalAndDeref(s.baseExpr);
        const index = this.evaluator.evalExpression(s.indexExpr);

        if (!(array instanceof Array)) {
            this.error(
                `Expected struct for ${s.baseExpr.pp()} instead of ${pp(array)}`,
                s.baseExpr
            );
        }

        if (!(typeof index === "bigint")) {
            this.error(
                `Expected index ${s.baseExpr.pp()} to be a number not ${pp(index)}`,
                s.indexExpr
            );
        }

        if (index >= BigInt(array.length) || index < 0n) {
            this.error(`Index ${index} OoB.`, s);
        }

        const rVal = this.evaluator.evalExpression(s.rhs);

        array[Number(index)] = rVal;
        this.state.curFrame.curBBInd++;
    }

    private jsEncode(v: PrimitiveValue): any {
        if (v instanceof Array) {
            const complexVal = this.deref(v);

            if (complexVal instanceof Array) {
                return complexVal.map(this.jsEncode);
            }

            const res: any = {};
            for (const [field, val] of complexVal) {
                res[field] = this.jsEncode(val);
            }

            return res;
        }

        return v;
    }

    execTransactionCall(s: TransactionCall): void {
        const callee = this.resolving.getIdDecl(s.callee);

        if (!(callee instanceof FunctionDefinition)) {
            this.error(`Expected ${s.callee.pp()} to be a function`, s);
        }

        const argVs = s.args.map((expr) => this.evaluator.evalExpression(expr));

        const newFrame = new Frame(
            callee,
            zip(
                callee.parameters.map((d) => d.name),
                argVs
            )
        );

        this.state.saveMemories();
        this.state.stack.push(newFrame);
    }

    execReturn(s: Return): void {
        const retVals = s.values.map(this.evaluator.evalExpression);

        if (this.state.stack.length === 1) {
            this.state.externalReturns = retVals.map(this.jsEncode);
        } else {
            const prevFrame = this.state.stack[this.state.stack.length - 2];
            const callStmt = prevFrame.curBB.statements[prevFrame.curBBInd];

            if (!(callStmt instanceof FunctionCall || callStmt instanceof TransactionCall)) {
                this.error(`Expected a call statement from return not ${callStmt.pp()}`, callStmt);
            }

            if (callStmt instanceof TransactionCall) {
                retVals.push(true);
                this.state.memoriesStack.pop();
            }

            const lhss = callStmt.lhss;

            if (lhss.length !== retVals.length) {
                this.error(`Mismatch in returns - expected ${lhss.length} got ${retVals.length}`);
            }

            for (let i = 0; i < lhss.length; i++) {
                this.assignTo(retVals[i], lhss[i], s);
            }
        }
        this.state.stack.pop();
    }

    execStatement(s: Statement): void {
        if (s instanceof Assignment) {
            this.execAssignment(s);
        }

        if (s instanceof Branch) {
            this.execBranch(s);
        }

        if (s instanceof FunctionCall) {
            this.execFunctionCall(s);
        }

        if (s instanceof Jump) {
            this.execJump(s);
        }

        if (s instanceof LoadField) {
            this.execLoadField(s);
        }

        if (s instanceof LoadIndex) {
            this.execLoadIndex(s);
        }

        if (s instanceof StoreField) {
            this.execStoreField(s);
        }

        if (s instanceof StoreIndex) {
            this.execStoreIndex(s);
        }

        if (s instanceof TransactionCall) {
            this.execTransactionCall(s);
        }

        if (s instanceof Return) {
            this.execReturn(s);
        }
    }
}
