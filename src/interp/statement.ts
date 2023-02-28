import {
    Abort,
    AllocArray,
    AllocStruct,
    Assert,
    Assignment,
    BoolType,
    Branch,
    Expression,
    FunctionCall,
    FunctionDefinition,
    GlobalVariable,
    Identifier,
    IntType,
    Jump,
    LoadField,
    LoadIndex,
    MemConstant,
    MemDesc,
    MemIdentifier,
    MemVariableDeclaration,
    noSrc,
    PointerType,
    Return,
    Statement,
    StoreField,
    StoreIndex,
    StructDefinition,
    TransactionCall,
    Type
} from "../ir";
import { CFG } from "../ir/cfg";
import { Node } from "../ir/node";
import { concretizeType, Resolving, Typing } from "../passes";
import { fill, fmt, pp, PPIsh, zip } from "../utils";
import { ExprEvaluator } from "./expression";
import { LiteralEvaluator } from "./literal";
import {
    BuiltinFrame,
    ComplexValue,
    EXCEPTION_MEM,
    Frame,
    InterpError,
    InterpInternalError,
    PointerVal,
    poison,
    PrimitiveValue,
    Program,
    State
} from "./state";
import { fits, toJsVal } from "./utils";

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
        throw new InterpError(e === undefined ? noSrc : e.src, msg, this.state);
    }

    private internalError(msg: string, e?: Node): never {
        throw new InterpInternalError(e === undefined ? noSrc : e.src, msg, this.state);
    }

    private assert(
        cond: boolean,
        msg: string,
        e: Node | undefined,
        ...details: PPIsh[]
    ): asserts cond {
        if (cond) {
            return;
        }

        this.internalError(fmt(msg, ...details), e);
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

        this.state.curMachFrame.curBBInd++;
    }

    execBranch(s: Branch): void {
        const condVal = this.evaluator.evalExpression(s.condition);

        this.assert(
            typeof condVal === "boolean",
            `Branch expected boolean condition not {0}`,
            s,
            condVal
        );

        const label = condVal ? s.trueLabel : s.falseLabel;
        const newBB = (this.state.curMachFrame.fun.body as CFG).nodes.get(label);

        this.assert(newBB !== undefined, `No BasicBlock found for label {0}`, s, label);

        this.state.curMachFrame.curBB = newBB;
        this.state.curMachFrame.curBBInd = 0;
    }

    private execCallImpl(s: FunctionCall | TransactionCall): void {
        const callee = this.resolving.getIdDecl(s.callee);

        this.assert(
            callee instanceof FunctionDefinition,
            `Expected {0} to be a function`,
            s,
            s.callee
        );

        const memArgs = s.memArgs.map((memArg) => this.resolveMemDesc(memArg));
        const typeArgs = s.typeArgs.map((typeArg) =>
            concretizeType(
                typeArg,
                this.state.curMachFrame.substituion,
                this.resolving.getScope(this.state.curMachFrame.fun)
            )
        );
        const argVs = s.args.map((expr) => this.evaluator.evalExpression(expr));

        if (s instanceof TransactionCall) {
            this.state.saveMemories();
        }

        if (callee.body) {
            const newFrame = new Frame(
                callee,
                zip(
                    callee.parameters.map((d) => d.name),
                    argVs
                ),
                memArgs,
                typeArgs
            );

            this.state.stack.push(newFrame);
        } else {
            const builtin = this.state.builtins.get(s.callee.name);

            this.assert(
                builtin !== undefined,
                "No builtin for empty function {0}",
                s,
                s.callee.name
            );

            const newFrame = new BuiltinFrame(
                callee,
                zip(
                    callee.parameters.map((d) => d.name),
                    argVs
                ),
                memArgs,
                typeArgs
            );

            this.state.stack.push(newFrame);

            const [aborted, returns] = builtin(this.state, newFrame);

            this.state.stack.pop();

            this.returnValsToFrame(returns, aborted, this.state.curMachFrame);

            this.state.curMachFrame.curBBInd++;
        }
    }

    execFunctionCall(s: FunctionCall): void {
        this.execCallImpl(s);
    }

    execJump(s: Jump): void {
        const newBB = (this.state.curMachFrame.fun.body as CFG).nodes.get(s.label);

        this.assert(newBB !== undefined, `No BasicBlock found for label {0}`, s, s.label);

        this.state.curMachFrame.curBB = newBB;
        this.state.curMachFrame.curBBInd = 0;
    }

    private assignTo(
        val: PrimitiveValue,
        lhs: Identifier,
        inStmt: Statement,
        ignorePoison = false
    ): void {
        let lhsType = this.typing.typeOf(lhs);

        this.assert(lhsType !== undefined, `Missing type for {0}`, lhs, lhs);

        const funScope = this.resolving.global.scopeOf(this.state.curMachFrame.fun);

        lhsType = concretizeType(lhsType, this.state.curMachFrame.substituion, funScope);

        if (val === poison && !ignorePoison) {
            this.error(`Attempt to assign ${val.pp()} to ${lhs.pp()}`, inStmt);
        }

        this.assert(
            this.agrees(val, lhsType) || val === poison,
            `Cannot assign {0} to {1} of type {2}`,
            inStmt,
            val,
            lhs,
            lhsType
        );

        this.state.curMachFrame.store.set(lhs.name, val);
    }

    deref(val: PointerVal, expr?: Expression): ComplexValue {
        try {
            return this.state.deref(val);
        } catch (e: any) {
            this.error(e.message, expr);
        }
    }

    private evalAndDeref(e: Expression): ComplexValue {
        const val = this.evaluator.evalExpression(e);

        this.assert(val instanceof Array, `Expected a pointer for {0} not {1}`, e, e, val);

        return this.deref(val, e);
    }

    execLoadField(s: LoadField): void {
        const struct = this.evalAndDeref(s.baseExpr);

        this.assert(
            struct instanceof Map,
            `Expected struct for {0} instead of {1}`,
            s.baseExpr,
            s.baseExpr,
            struct
        );

        const val = struct.get(s.member);

        this.assert(val !== undefined, `Struct missing field {0}`, s, s.member);

        this.assignTo(val, s.lhs, s);

        this.state.curMachFrame.curBBInd++;
    }

    execLoadIndex(s: LoadIndex): void {
        const array = this.evalAndDeref(s.baseExpr);
        const index = this.evaluator.evalExpression(s.indexExpr);

        this.assert(
            array instanceof Array,
            `Expected struct for {0} instead of {1}`,
            s.baseExpr,
            s.baseExpr,
            array
        );

        this.assert(
            typeof index === "bigint",
            `Expected index {0} to be a number not {1}`,
            s.indexExpr,
            s.baseExpr,
            index
        );

        if (index >= BigInt(array.length) || index < 0n) {
            this.error(`Index ${index} OoB.`, s);
        }

        const val = array[Number(index)];

        this.assignTo(val, s.lhs, s);

        this.state.curMachFrame.curBBInd++;
    }

    execStoreField(s: StoreField): void {
        const struct = this.evalAndDeref(s.baseExpr);

        this.assert(
            struct instanceof Map,
            `Expected struct for {0} instead of {1}`,
            s.baseExpr,
            s.baseExpr,
            struct
        );

        const rVal = this.evaluator.evalExpression(s.rhs);

        struct.set(s.member, rVal);

        this.state.curMachFrame.curBBInd++;
    }

    execStoreIndex(s: StoreIndex): void {
        const array = this.evalAndDeref(s.baseExpr);
        const index = this.evaluator.evalExpression(s.indexExpr);

        this.assert(
            array instanceof Array,
            `Expected struct for {0} instead of {1}`,
            s.baseExpr,
            s.baseExpr,
            array
        );

        this.assert(
            typeof index === "bigint",
            `Expected index {0} to be a number not {1}`,
            s.indexExpr,
            s.baseExpr,
            index
        );

        if (index >= BigInt(array.length) || index < 0n) {
            this.error(`Index ${index} OoB.`, s);
        }

        const rVal = this.evaluator.evalExpression(s.rhs);

        array[Number(index)] = rVal;

        this.state.curMachFrame.curBBInd++;
    }

    execTransactionCall(s: TransactionCall): void {
        this.execCallImpl(s);
    }

    private restoreMemsOnReturnFromTransaction(aborted: boolean, stmt: Statement) {
        const lastSave = this.state.popMemories();

        if (aborted) {
            /// #exception memory is special - it doesn't get reverted on abort.
            /// This allows passing exception data back
            const curExcMem = this.state.memories.get(EXCEPTION_MEM);

            this.assert(curExcMem !== undefined, `Missing #exception memory`, stmt);

            this.state.memories = lastSave;

            this.state.memories.set(EXCEPTION_MEM, curExcMem);
        }
    }

    private returnValsToExternalCtx(vals: PrimitiveValue[], aborted: boolean, stmt: Statement) {
        this.assert(
            this.state.stack.length === 0,
            `Cannot return to external context from non-empty stack`,
            stmt
        );

        vals = [...vals];

        if (this.state.rootIsTransaction) {
            vals.push(aborted);

            this.restoreMemsOnReturnFromTransaction(aborted, stmt);
        }

        this.state.externalReturns = vals.map((v) => toJsVal(v, this.state));
    }

    private returnValsToFrame(vals: PrimitiveValue[], aborted: boolean, frame: Frame) {
        const stmt = frame.curBB.statements[frame.curBBInd];

        this.assert(
            stmt instanceof FunctionCall || stmt instanceof TransactionCall,
            `Expected a call statement not {0}`,
            stmt,
            stmt
        );

        // If this was a transaction call handle restoring memories
        if (stmt instanceof TransactionCall) {
            vals.push(aborted);

            this.restoreMemsOnReturnFromTransaction(aborted, stmt);
        }

        const lhss = stmt.lhss;

        this.assert(
            lhss.length === vals.length,
            `Mismatch in returns - expected {0} got {1}`,
            stmt,
            lhss.length,
            vals.length
        );

        for (let i = 0; i < lhss.length; i++) {
            /// On Aborted we allow emitting poison in the normal return values.
            this.assignTo(vals[i], lhss[i], stmt, aborted);
        }
    }

    execReturn(s: Return): void {
        const retVals = s.values.map((v) => this.evaluator.evalExpression(v));

        this.state.stack.pop();

        if (this.state.stack.length === 0) {
            this.returnValsToExternalCtx(retVals, false, s);
        } else {
            this.returnValsToFrame(
                retVals,
                false,
                this.state.stack[this.state.stack.length - 1] as Frame
            );

            this.state.curMachFrame.curBBInd++;
        }
    }

    private makePoisonArr(nRets: number): PrimitiveValue[] {
        return fill(nRets, poison);
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    execAbort(s: Abort): void {
        let nRets = this.state.curMachFrame.fun.returns.length;

        while (this.state.stack.length > 1) {
            this.state.stack.pop();

            const curFrame = this.state.curMachFrame;
            const curStmt = curFrame.curBB.statements[curFrame.curBBInd];

            if (!(curStmt instanceof TransactionCall)) {
                nRets = curFrame.fun.returns.length;

                continue;
            }

            this.returnValsToFrame(this.makePoisonArr(nRets), true, curFrame);

            this.state.curMachFrame.curBBInd++;

            return;
        }

        this.state.stack.pop();

        this.returnValsToExternalCtx(this.makePoisonArr(nRets), true, s);
    }

    private resolveMemDesc(m: MemDesc): MemConstant {
        if (m instanceof MemConstant) {
            return m;
        }

        let frameIdx = this.state.stack.length - 1;

        while (m instanceof MemIdentifier) {
            const curFrame = this.state.stack[frameIdx];
            const decl = this.resolving.getMemIdDecl(m);

            this.assert(
                decl instanceof MemVariableDeclaration,
                `Expected memvar decl for {0}`,
                m,
                m.name
            );

            const varIdx = curFrame.fun.memoryParameters.indexOf(decl);

            this.assert(
                varIdx !== -1,
                `{0} not defined on function {1}`,
                decl,
                decl,
                curFrame.fun.name
            );

            frameIdx--;

            if (frameIdx >= 0) {
                const prevFrame = this.state.stack[frameIdx] as Frame;
                const callInst = prevFrame.curStmt;

                this.assert(
                    callInst instanceof FunctionCall || callInst instanceof TransactionCall,
                    `Expected last frame instructions to be a call not {0}`,
                    callInst,
                    callInst
                );

                m = callInst.memArgs[varIdx];
            } else {
                m = this.state.rootMemArgs[varIdx];
            }
        }

        return m;
    }

    execAllocArray(s: AllocArray): void {
        const size = this.evaluator.evalExpression(s.size);

        this.assert(
            typeof size === "bigint",
            `Expected size {0} to be a number not {1}`,
            s.size,
            s.size,
            size
        );

        if (size < 0) {
            this.error(`Array size ${size} is negative`, s.size);
        }

        this.assert(size <= Number.MAX_SAFE_INTEGER, `Array size {0} is too big`, s.size, size);

        const arr = this.makePoisonArr(Number(size));
        const mem = this.resolveMemDesc(s.mem);
        const ptr = this.state.define(arr, mem.name);

        this.assignTo(ptr, s.lhs, s);

        this.state.curMachFrame.curBBInd++;
    }

    execAllocStruct(s: AllocStruct): void {
        const decl = this.resolving.getTypeDecl(s.type);

        this.assert(
            decl instanceof StructDefinition,
            `Expected a struct for {0} not {1}`,
            s.type,
            s.type,
            decl
        );

        const struct = new Map<string, PrimitiveValue>();

        for (const [fieldName] of decl.fields) {
            struct.set(fieldName, poison);
        }

        const mem = this.resolveMemDesc(s.mem);
        const ptr = this.state.define(struct, mem.name);

        this.assignTo(ptr, s.lhs, s);

        this.state.curMachFrame.curBBInd++;
    }

    execAssert(s: Assert): void {
        const condVal = this.evaluator.evalExpression(s.condition);

        this.assert(
            typeof condVal === "boolean",
            `Assert expected boolean condition not {0}`,
            s,
            condVal
        );

        if (!condVal) {
            this.error(`Assertion ${s.pp()} failed`, s);
        }

        this.state.curMachFrame.curBBInd++;
    }

    execStatement(s: Statement): void {
        // Once in the failed state, we perpetually stay there.
        if (this.state.failed) {
            return;
        }

        try {
            if (s instanceof Assignment) {
                return this.execAssignment(s);
            }

            if (s instanceof Branch) {
                return this.execBranch(s);
            }

            if (s instanceof FunctionCall) {
                return this.execFunctionCall(s);
            }

            if (s instanceof Jump) {
                return this.execJump(s);
            }

            if (s instanceof LoadField) {
                return this.execLoadField(s);
            }

            if (s instanceof LoadIndex) {
                return this.execLoadIndex(s);
            }

            if (s instanceof StoreField) {
                return this.execStoreField(s);
            }

            if (s instanceof StoreIndex) {
                return this.execStoreIndex(s);
            }

            if (s instanceof TransactionCall) {
                return this.execTransactionCall(s);
            }

            if (s instanceof Abort) {
                return this.execAbort(s);
            }

            if (s instanceof Return) {
                return this.execReturn(s);
            }

            if (s instanceof AllocArray) {
                return this.execAllocArray(s);
            }

            if (s instanceof AllocStruct) {
                return this.execAllocStruct(s);
            }

            if (s instanceof Assert) {
                return this.execAssert(s);
            }

            this.internalError(`Unknown statement ${pp(s)}`, s);
        } catch (e) {
            if (e instanceof InterpError) {
                this.state.fail(e);
            } else {
                throw e;
            }
        }
    }
}

export function* runProgram(
    litEvaluator: LiteralEvaluator,
    stmtExecutor: StatementExecutor,
    program: Program,
    state: State,
    entryPoint: FunctionDefinition,
    entryArgs: PrimitiveValue[],
    rootTrans: boolean
): Generator<Statement> {
    // First initialize globals
    for (const def of program) {
        if (def instanceof GlobalVariable) {
            state.globals.set(def.name, litEvaluator.evalLiteral(def.initialValue, def.type));
        }
    }

    // Next initialize root call
    state.startRootCall(entryPoint, entryArgs, [], [], rootTrans);

    // Finally interpret until we are done or aborted
    while (state.running) {
        const stmt = state.curMachFrame.curBB.statements[state.curMachFrame.curBBInd];

        yield stmt;

        stmtExecutor.execStatement(stmt);
    }
}
