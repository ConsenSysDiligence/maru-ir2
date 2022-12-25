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
    StructDefinition,
    Assert,
    MemDesc,
    MemVariableDeclaration
} from "../ir";
import { CFG } from "../ir/cfg";
import { Node } from "../ir/node";
import { Resolving, Typing } from "../passes";
import { fmt, pp, PPIsh, zip } from "../utils";
import { ExprEvaluator, fits } from "./expression";
import {
    ComplexValue,
    EXCEPTION_MEM,
    Frame,
    InterpError,
    InterpInternalError,
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

    private internalError(msg: string, e?: Node): never {
        throw new InterpInternalError(e === undefined ? new NoSrc() : e, msg, this.state);
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
        this.state.curFrame.curBBInd++;
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
        const newBB = (this.state.curFrame.fun.body as CFG).nodes.get(label);

        this.assert(newBB !== undefined, `No BasicBlock found for label {0}`, s, label);

        this.state.curFrame.curBB = newBB;
        this.state.curFrame.curBBInd = 0;
    }

    execFunctionCall(s: FunctionCall): void {
        const callee = this.resolving.getIdDecl(s.callee);

        this.assert(
            callee instanceof FunctionDefinition,
            `Expected {0} to be a function`,
            s,
            s.callee
        );

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
        this.assert(newBB !== undefined, `No BasicBlock found for label {0}`, s, s.label);

        this.state.curFrame.curBB = newBB;
        this.state.curFrame.curBBInd = 0;
    }

    private assignTo(
        val: PrimitiveValue,
        lhs: Identifier,
        inStmt: Statement,
        ignorePoison = false
    ): void {
        const lhsType = this.typing.typeOf(lhs);

        this.assert(lhsType !== undefined, `Missing type for {0}`, lhs, lhs);

        if (val === poison && !ignorePoison) {
            this.error(`Attempt to assign ${val.pp()} to ${lhs.pp()}`, inStmt);
        }

        this.assert(
            this.agrees(val, lhsType) || val === poison,
            `Cannot assign {0} to {1} of type {}`,
            inStmt,
            val,
            lhs,
            lhsType
        );

        this.state.curFrame.store.set(lhs.name, val);
    }

    private deref(val: PointerVal, e?: Expression): ComplexValue {
        const mem = this.state.memories.get(val[0]);

        this.assert(mem !== undefined, `Memory {0} not found.`, e, val[0]);

        const loadedVal = mem.get(val[1]);

        if (loadedVal === undefined) {
            this.error(`Pointer ${val[1]} in ${val[0]} is undefined.`, e);
        }

        return loadedVal;
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
        this.state.curFrame.curBBInd++;
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
        this.state.curFrame.curBBInd++;
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
        this.state.curFrame.curBBInd++;
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

        this.assert(
            callee instanceof FunctionDefinition,
            `Expected {0} to be a function`,
            s,
            s.callee
        );

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

        this.state.externalReturns = vals.map(this.jsEncode);
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
            `Mismatch in returns - expected {0} got {0}`,
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
            this.returnValsToFrame(retVals, false, this.state.stack[this.state.stack.length - 1]);
            this.state.curFrame.curBBInd++;
        }
    }

    private makePoisonRets(nRets: number): PrimitiveValue[] {
        const retVals: PrimitiveValue[] = [];

        for (let i = 0; i < nRets; i++) {
            retVals.push(poison);
        }

        return retVals;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    execAbort(s: Abort): void {
        let nRets = this.state.curFrame.fun.returns.length;

        while (this.state.stack.length > 1) {
            this.state.stack.pop();

            const curFrame = this.state.curFrame;
            const curStmt = curFrame.curBB.statements[curFrame.curBBInd];

            if (!(curStmt instanceof TransactionCall)) {
                nRets = curFrame.fun.returns.length;
                continue;
            }

            this.returnValsToFrame(this.makePoisonRets(nRets), true, curFrame);
            this.state.curFrame.curBBInd++;
            return;
        }

        this.state.stack.pop();
        this.returnValsToExternalCtx(this.makePoisonRets(nRets), true, s);
    }

    private resolveMemDesc(m: MemDesc): MemConstant {
        if (m instanceof MemConstant) {
            return m;
        }

        let frameIdx = this.state.stack.length - 1;

        while (m instanceof Identifier) {
            const curFrame = this.state.stack[frameIdx];
            const decl = this.resolving.getIdDecl(m);

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

            let memArgs: MemDesc[];

            if (frameIdx >= 0) {
                const prevFrame = this.state.stack[frameIdx];
                const callInst = prevFrame.curStmt;

                this.assert(
                    callInst instanceof FunctionCall || callInst instanceof TransactionCall,
                    `Expected last frame instructions to be a call not {0}`,
                    callInst,
                    callInst
                );

                memArgs = callInst.memArgs;
            } else {
                memArgs = this.state.rootMemArgs;
            }

            m = memArgs[varIdx];
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
            this.error(`Array size ${size} is too big!`, s.size);
        }

        this.assert(size < Number.MAX_SAFE_INTEGER, `Array size {0} is too big!`, s.size, size);

        const newArr = [];

        for (let i = 0; i < Number(size); i++) {
            newArr.push(poison);
        }

        const mem = this.resolveMemDesc(s.mem);
        const ptr = this.define(newArr, mem.name);

        this.assignTo(ptr, s.lhs, s);
        this.state.curFrame.curBBInd++;
    }

    execAllocStruct(s: AllocStruct): void {
        const newStruct = new Map<string, PrimitiveValue>();

        const decl = this.resolving.getTypeDecl(s.type);

        this.assert(
            decl instanceof StructDefinition,
            `Expected a struct for {0} not {1}`,
            s.type,
            s.type,
            decl
        );

        for (const [fieldName] of decl.fields) {
            newStruct.set(fieldName, poison);
        }

        const mem = this.resolveMemDesc(s.mem);
        const ptr = this.define(newStruct, mem.name);

        this.assignTo(ptr, s.lhs, s);
        this.state.curFrame.curBBInd++;
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

        this.state.curFrame.curBBInd++;
    }

    execStatement(s: Statement): void {
        // Once in the failed state, we perpetually stay there.
        if (this.state.failed) {
            return;
        }

        try {
            if (s instanceof Assignment) {
                this.execAssignment(s);
                return;
            }

            if (s instanceof Branch) {
                this.execBranch(s);
                return;
            }

            if (s instanceof FunctionCall) {
                this.execFunctionCall(s);
                return;
            }

            if (s instanceof Jump) {
                this.execJump(s);
                return;
            }

            if (s instanceof LoadField) {
                this.execLoadField(s);
                return;
            }

            if (s instanceof LoadIndex) {
                this.execLoadIndex(s);
                return;
            }

            if (s instanceof StoreField) {
                this.execStoreField(s);
                return;
            }

            if (s instanceof StoreIndex) {
                this.execStoreIndex(s);
                return;
            }

            if (s instanceof TransactionCall) {
                this.execTransactionCall(s);
                return;
            }

            if (s instanceof Abort) {
                this.execAbort(s);
                return;
            }

            if (s instanceof Return) {
                this.execReturn(s);
                return;
            }

            if (s instanceof AllocArray) {
                this.execAllocArray(s);
                return;
            }

            if (s instanceof AllocStruct) {
                this.execAllocStruct(s);
                return;
            }

            if (s instanceof Assert) {
                this.execAssert(s);
                return;
            }

            this.internalError(`Unknown statement ${pp(s)}`);
        } catch (e) {
            if (e instanceof InterpError) {
                this.state.fail(e);

                return;
            }

            throw e;
        }
    }
}
