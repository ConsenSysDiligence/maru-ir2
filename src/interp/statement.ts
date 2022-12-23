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
            this.internalError(`Branch expected boolean condition not ${condVal}`, s);
        }

        const label = condVal ? s.trueLabel : s.falseLabel;
        const newBB = (this.state.curFrame.fun.body as CFG).nodes.get(label);

        if (!newBB) {
            this.internalError(`No BasicBlock found for label ${label}`, s);
        }

        this.state.curFrame.curBB = newBB;
        this.state.curFrame.curBBInd = 0;
    }

    execFunctionCall(s: FunctionCall): void {
        const callee = this.resolving.getIdDecl(s.callee);

        if (!(callee instanceof FunctionDefinition)) {
            this.internalError(`Expected ${s.callee.pp()} to be a function`, s);
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
            this.internalError(`No BasicBlock found for label ${s.label}`, s);
        }

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

        if (lhsType === undefined) {
            this.internalError(`Missing type for ${lhs.pp()}`, lhs);
        }

        if (val === poison && !ignorePoison) {
            this.error(`Attempt to assign ${val.pp()} to ${lhs.pp()}`, inStmt);
        }

        if (!this.agrees(val, lhsType) && val !== poison) {
            this.internalError(
                `Cannot assign ${pp(val)} to ${lhs.pp()} of type ${lhsType.pp()}`,
                inStmt
            );
        }

        this.state.curFrame.store.set(lhs.name, val);
    }

    private deref(val: PointerVal, e?: Expression): ComplexValue {
        const mem = this.state.memories.get(val[0]);

        if (mem === undefined) {
            this.internalError(`Memory ${val[0]} not found.`, e);
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
            this.internalError(`Expected a pointer for ${e.pp()} not ${val}`, e);
        }

        return this.deref(val, e);
    }

    execLoadField(s: LoadField): void {
        const struct = this.evalAndDeref(s.baseExpr);

        if (!(struct instanceof Map)) {
            this.internalError(
                `Expected struct for ${s.baseExpr.pp()} instead of ${pp(struct)}`,
                s.baseExpr
            );
        }

        const val = struct.get(s.member);

        if (val === undefined) {
            this.internalError(`Struct missing field ${s.member}`, s);
        }

        this.assignTo(val, s.lhs, s);
        this.state.curFrame.curBBInd++;
    }

    execLoadIndex(s: LoadIndex): void {
        const array = this.evalAndDeref(s.baseExpr);
        const index = this.evaluator.evalExpression(s.indexExpr);

        if (!(array instanceof Array)) {
            this.internalError(
                `Expected struct for ${s.baseExpr.pp()} instead of ${pp(array)}`,
                s.baseExpr
            );
        }

        if (!(typeof index === "bigint")) {
            this.internalError(
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
            this.internalError(
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
            this.internalError(
                `Expected struct for ${s.baseExpr.pp()} instead of ${pp(array)}`,
                s.baseExpr
            );
        }

        if (!(typeof index === "bigint")) {
            this.internalError(
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
            this.internalError(`Expected ${s.callee.pp()} to be a function`, s);
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

    private returnValsToExternalCtx(vals: PrimitiveValue[], aborted: boolean) {
        if (this.state.stack.length !== 0) {
            this.internalError(`Cannot return to external context from non-empty stack`);
        }

        vals = [...vals, !aborted];
        this.state.externalReturns = vals.map(this.jsEncode);
    }

    private returnValsToFrame(vals: PrimitiveValue[], aborted: boolean, frame: Frame) {
        const stmt = frame.curBB.statements[frame.curBBInd];

        if (!(stmt instanceof FunctionCall || stmt instanceof TransactionCall)) {
            this.internalError(`Expected a call statement not ${stmt.pp()}`, stmt);
        }

        // If this was a transaction call handle restoring memories
        if (stmt instanceof TransactionCall) {
            const lastSave = this.state.popMemories();

            if (aborted) {
                /// #exception memory is special - it doesn't get reverted on abort.
                /// This allows passing exception data back
                const curExcMem = this.state.memories.get(EXCEPTION_MEM);

                if (curExcMem === undefined) {
                    this.internalError(`Missing #exception memory`, stmt);
                }

                this.state.memories = lastSave;
                this.state.memories.set(EXCEPTION_MEM, curExcMem);
            }
        }

        const lhss = stmt.lhss;

        if (lhss.length !== vals.length) {
            this.internalError(`Mismatch in returns - expected ${lhss.length} got ${vals.length}`);
        }

        for (let i = 0; i < lhss.length; i++) {
            /// On Aborted we allow emitting poison in the normal return values.
            this.assignTo(vals[i], lhss[i], stmt, aborted);
        }
    }

    execReturn(s: Return): void {
        const retVals = s.values.map((v) => this.evaluator.evalExpression(v));
        this.state.stack.pop();

        if (this.state.stack.length === 0) {
            this.returnValsToExternalCtx(retVals, false);
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

        retVals.push(true);

        return retVals;
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    execAbort(s: Abort): void {
        let nRets = this.state.curFrame.fun.returns.length;

        while (this.state.stack.length > 0) {
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

        this.returnValsToExternalCtx(this.makePoisonRets(nRets), true);
    }

    execAllocArray(s: AllocArray): void {
        const size = this.evaluator.evalExpression(s.size);

        if (!(typeof size === "bigint")) {
            this.internalError(
                `Expected size ${s.size.pp()} to be a number not ${pp(size)}`,
                s.size
            );
        }

        if (size < 0n || size > Number.MAX_SAFE_INTEGER) {
            this.internalError(`Array size ${size} is too big!`, s.size);
        }

        const newArr = [];

        for (let i = 0; i < Number(size); i++) {
            newArr.push(poison);
        }

        if (!(s.mem instanceof MemConstant)) {
            this.internalError(`NYI memory substitution in the interpreter`, s.mem);
        }

        const ptr = this.define(newArr, s.mem.name);

        this.assignTo(ptr, s.lhs, s);
        this.state.curFrame.curBBInd++;
    }

    execAllocStruct(s: AllocStruct): void {
        const newStruct = new Map<string, PrimitiveValue>();

        const decl = this.resolving.getTypeDecl(s.type);

        if (!(decl instanceof StructDefinition)) {
            this.internalError(`Expected a struct for ${s.type.pp()} not ${pp(decl)}`, s.type);
        }

        for (const [fieldName] of decl.fields) {
            newStruct.set(fieldName, poison);
        }

        if (!(s.mem instanceof MemConstant)) {
            this.internalError(`NYI memory substitution in the interpreter`, s.mem);
        }

        const ptr = this.define(newStruct, s.mem.name);

        this.assignTo(ptr, s.lhs, s);
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
        } catch (e) {
            if (e instanceof InterpError) {
                this.state.fail(e);

                return;
            }

            throw e;
        }
    }
}
