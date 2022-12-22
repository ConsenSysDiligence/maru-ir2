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
    Abort,
    TransactionCall,
    Type,
    AllocArray,
    AllocStruct,
    MemConstant,
    StructDefinition
} from "../ir";
import { CFG } from "../ir/cfg";
import { Node } from "../ir/node";
import { Resolving, Typing } from "../passes";
import { pp, zip } from "../utils";
import { ExprEvaluator, fits, InterpError } from "./expression";
import {
    ComplexValue,
    EXCEPTION_MEM,
    Frame,
    Memory,
    PointerVal,
    poison,
    PrimitiveValue,
    State
} from "./state";

export class StatementExecutor {
    evaluator: ExprEvaluator;
    maxMemPtr: Map<string, number>;

    constructor(
        private readonly resolving: Resolving,
        private readonly typing: Typing,
        private readonly state: State
    ) {
        this.evaluator = new ExprEvaluator(typing, state);
        this.maxMemPtr = new Map();
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

    /// Helper to extract an interpreter value into
    /// a normal JS value. Supports maps and arrays.
    public jsEncode(v: PrimitiveValue): any {
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

    private getNewPtr(memory: string): number {
        let curMax = this.maxMemPtr.get(memory);

        if (curMax === undefined) {
            const mem = this.state.memories.get(memory) as Memory;
            curMax = mem.size === 0 ? 0 : Math.max(...mem.keys()) + 1;
        }

        this.maxMemPtr.set(memory, curMax + 1);

        return curMax;
    }

    private define(val: ComplexValue, memory: string): PointerVal {
        const mem = this.state.memories.get(memory) as Memory;
        const ptr = this.getNewPtr(memory);
        mem.set(ptr, val);

        return [memory, ptr];
    }

    /// Helper to convert a normal JS value into an interpreter value.
    /// If the JS value is complex, then it is encoded in the provided
    /// `memory`
    public jsDecode(jsV: any, memory: string): PrimitiveValue {
        if (typeof jsV === "number") {
            return BigInt(jsV);
        }

        if (typeof jsV === "bigint" || typeof jsV === "boolean") {
            return jsV;
        }

        if (jsV instanceof Array) {
            const encodedArr = jsV.map((el) => this.jsDecode(el, memory));
            return this.define(encodedArr, memory);
        }

        if (jsV instanceof Object) {
            const encodedStruct = new Map();

            for (const field in jsV) {
                encodedStruct.set(field, this.jsDecode(jsV[field], memory));
            }

            return this.define(encodedStruct, memory);
        }

        throw new Error(`Cannot encode ${pp(jsV)} into interpreter`);
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

    private returnValsFromFrame(vals: PrimitiveValue[], aborted: boolean, s: Statement) {
        const isRootCall = this.state.stack.length === 1;
        let isTransactionCall = isRootCall;

        if (!isRootCall) {
            const prevFrame = this.state.stack[this.state.stack.length - 2];
            const callStmt = prevFrame.curBB.statements[prevFrame.curBBInd];

            isTransactionCall = callStmt instanceof TransactionCall;
        }

        if (isTransactionCall) {
            vals = [...vals, !aborted];
        }

        if (isTransactionCall && !isRootCall) {
            const lastSave = this.state.popMemories();

            if (aborted) {
                /// #exception memory is special - it doesn't get reverted on abort.
                /// This allows passing exception data back
                const curExcMem = this.state.memories.get(EXCEPTION_MEM);

                if (curExcMem === undefined) {
                    this.error(`Missing #exception memory`, s);
                }

                this.state.memories = lastSave;
                this.state.memories.set(EXCEPTION_MEM, curExcMem);
            }
        }

        if (isRootCall) {
            this.state.externalReturns = vals.map(this.jsEncode);
        } else {
            const prevFrame = this.state.stack[this.state.stack.length - 2];
            const callStmt = prevFrame.curBB.statements[prevFrame.curBBInd];

            if (!(callStmt instanceof FunctionCall || callStmt instanceof TransactionCall)) {
                this.error(`Expected a call statement from return not ${callStmt.pp()}`, callStmt);
            }

            const lhss = callStmt.lhss;

            if (lhss.length !== vals.length) {
                this.error(`Mismatch in returns - expected ${lhss.length} got ${vals.length}`);
            }

            for (let i = 0; i < lhss.length; i++) {
                this.assignTo(vals[i], lhss[i], s);
            }
        }

        this.state.stack.pop();
    }

    execReturn(s: Return): void {
        this.returnValsFromFrame(
            s.values.map((v) => this.evaluator.evalExpression(v)),
            false,
            s
        );
    }

    execAbort(s: Abort): void {
        const retVals: PrimitiveValue[] = [];

        for (let i = 0; i < this.state.curFrame.fun.returns.length; i++) {
            retVals.push(poison);
        }

        retVals.push(true);
        this.returnValsFromFrame(retVals, true, s);
    }

    execAllocArray(s: AllocArray): void {
        const size = this.evaluator.evalExpression(s.size);

        if (!(typeof size === "bigint")) {
            this.error(`Expected size ${s.size.pp()} to be a number not ${pp(size)}`, s.size);
        }

        if (size < 0n || size > Number.MAX_SAFE_INTEGER) {
            this.error(`Array size ${size} is too big!`, s.size);
        }

        const newArr = [];

        for (let i = 0; i < Number(size); i++) {
            newArr.push(poison);
        }

        if (!(s.mem instanceof MemConstant)) {
            throw new Error(`NYI memory substitution in the interpreter`);
        }

        const ptr = this.define(newArr, s.mem.name);

        this.assignTo(ptr, s.lhs, s);
        this.state.curFrame.curBBInd++;
    }

    execAllocStruct(s: AllocStruct): void {
        const newStruct = new Map<string, PrimitiveValue>();

        const decl = this.resolving.getTypeDecl(s.type);

        if (!(decl instanceof StructDefinition)) {
            this.error(`Expected a struct for ${s.type.pp()} not ${pp(decl)}`, s.type);
        }

        for (const [fieldName] of decl.fields) {
            newStruct.set(fieldName, poison);
        }

        if (!(s.mem instanceof MemConstant)) {
            throw new Error(`NYI memory substitution in the interpreter`);
        }

        const ptr = this.define(newStruct, s.mem.name);

        this.assignTo(ptr, s.lhs, s);
        this.state.curFrame.curBBInd++;
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

        if (s instanceof Abort) {
            this.execAbort(s);
        }

        if (s instanceof Return) {
            this.execReturn(s);
        }

        if (s instanceof AllocArray) {
            this.execAllocArray(s);
        }

        if (s instanceof AllocStruct) {
            this.execAllocStruct(s);
        }
    }
}
