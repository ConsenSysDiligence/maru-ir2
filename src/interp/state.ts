import {
    BaseSrc,
    Definition,
    FunctionDefinition,
    MemConstant,
    MemIdentifier,
    Statement,
    Type
} from "../ir";
import { BasicBlock } from "../ir/cfg";
import { Substitution } from "../passes";
import { pp, PPAble, walk, zip } from "../utils";

export class InterpError extends Error {
    constructor(public readonly src: BaseSrc, msg: string, state: State) {
        super(`${src.pp()}: ${msg}\n${state.stackTrace()}`);
    }
}

export class InterpInternalError extends Error {
    constructor(public readonly src: BaseSrc, msg: string, state: State) {
        super(`${src.pp()}: ${msg}\n${state.stackTrace()}`);
    }
}

class PoisonValue implements PPAble {
    pp(): string {
        return "!POISON!";
    }
}

export const poison = new PoisonValue();

export type PointerVal = [string, number];
export type PrimitiveValue = bigint | boolean | PointerVal | PoisonValue;

export type ComplexValue = PrimitiveValue[] | Map<string, PrimitiveValue>;

export type Store = Map<string, PrimitiveValue>;

export const EXCEPTION_MEM = "exception";

let freshMemCtr = 0;

export abstract class BaseFrame implements PPAble {
    fun: FunctionDefinition;
    args: Array<[string, PrimitiveValue]>;
    store: Store;
    freshMemories: Map<MemIdentifier, string>;
    memArgs: MemConstant[];
    typeArgs: Type[];
    substituion: Substitution;

    constructor(
        fun: FunctionDefinition,
        args: Array<[string, PrimitiveValue]>,
        memArgs: MemConstant[],
        typeArgs: Type[]
    ) {
        this.fun = fun;

        this.args = args;
        this.store = new Map();
        this.freshMemories = new Map();
        this.memArgs = memArgs;
        this.typeArgs = typeArgs;

        for (const [argName, argVal] of args) {
            this.store.set(argName, argVal);
        }

        for (const locDecl of fun.locals) {
            this.store.set(locDecl.name, poison);
        }

        this.substituion = [
            new Map(zip(fun.memoryParameters, memArgs)),
            new Map(zip(fun.typeParameters, typeArgs))
        ];
    }

    abstract pp(): string;
    abstract dump(indent: string): string;
}

export class Frame extends BaseFrame {
    curBB: BasicBlock;
    curBBInd: number;

    constructor(
        fun: FunctionDefinition,
        args: Array<[string, PrimitiveValue]>,
        memArgs: MemConstant[],
        typeArgs: Type[]
    ) {
        super(fun, args, memArgs, typeArgs);

        if (!fun.body) {
            throw new Error(`Unexpected stack frame for function without body ${fun.name}`);
        }

        this.curBB = fun.body.entry;
        this.curBBInd = 0;
    }

    pp(): string {
        return `${this.fun.name}:${this.curBB.label}:${this.curBBInd} ${this.curBB.statements[
            this.curBBInd
        ].pp()}`;
    }

    dump(indent: string): string {
        const storeStrs = [];

        for (const [name, val] of this.store) {
            storeStrs.push(`${name}: ${pp(val)}`);
        }

        return `${indent}${this.pp()} <${storeStrs.join(", ")}>`;
    }

    get curStmt(): Statement {
        return this.curBB.statements[this.curBBInd];
    }
}

export class BuiltinFrame extends BaseFrame {
    constructor(
        fun: FunctionDefinition,
        args: Array<[string, PrimitiveValue]>,
        memArgs: MemConstant[],
        typeArgs: Type[]
    ) {
        super(fun, args, memArgs, typeArgs);
    }

    pp(): string {
        return `${this.fun.name}:<builtin>`;
    }

    dump(indent: string): string {
        const storeStrs = [];

        for (const [name, val] of this.store) {
            storeStrs.push(`${name}: ${pp(val)}`);
        }

        return `${indent}${this.pp()} <${storeStrs.join(", ")}>`;
    }
}

export type Stack = BaseFrame[];

export type Memory = Map<number, ComplexValue>;
export type Memories = Map<string, Memory>;

export type BuiltinFun = (s: State, frame: BuiltinFrame) => [boolean, PrimitiveValue[]];

export type Program = Definition[];

export class State {
    program: Program;
    stack: Stack;
    memories: Memories;
    builtins: Map<string, BuiltinFun>;
    externalReturns: any[] | undefined;
    failure: InterpError | undefined;
    rootMemArgs: MemConstant[];
    globals: Store;
    public rootIsTransaction: boolean;
    maxMemPtr: Map<string, number>;

    /**
     * Stack of memory copies created for each transaction call.
     */
    memoriesStack: Memories[];

    constructor(
        program: Program,
        entryMemArgs: MemConstant[],
        isTransaction: boolean,
        builtins: Map<string, BuiltinFun>
    ) {
        this.program = program;
        this.stack = [];
        this.memories = new Map();

        for (const memName of this.getInitialMemories(program)) {
            this.memories.set(memName, new Map());
        }

        this.builtins = builtins;
        this.memoriesStack = [];
        this.failure = undefined;
        this.rootMemArgs = entryMemArgs;
        this.rootIsTransaction = isTransaction;
        this.maxMemPtr = new Map();
        this.globals = new Map();
    }

    startRootCall(
        entryFun: FunctionDefinition,
        entryFunArgs: PrimitiveValue[],
        entryMemArgs: MemConstant[],
        entryTypeArgs: Type[],
        isTransaction: boolean
    ): void {
        if (this.stack.length > 0 || this.failure !== undefined) {
            throw new Error(`Starting new root call in non-terminated/aborted state`);
        }

        this.stack.push(
            new Frame(
                entryFun,
                zip(
                    entryFun.parameters.map((p) => p.name),
                    entryFunArgs
                ),
                entryMemArgs,
                entryTypeArgs
            )
        );

        if (isTransaction) {
            this.saveMemories();
        }
    }

    get curMachFrame(): Frame {
        return this.stack[this.stack.length - 1] as Frame;
    }

    get failed(): boolean {
        return this.failure !== undefined;
    }

    get running(): boolean {
        return this.stack.length > 0 && !this.failed;
    }

    fail(e: InterpError): void {
        this.failure = e;
    }

    /// Compute the initial set of memories needed by walking over all trees
    /// and accumulating all memory constants
    private getInitialMemories(program: Program): Iterable<string> {
        const res = new Set<string>([EXCEPTION_MEM]);

        for (const def of program) {
            walk(def, (n) => {
                if (n instanceof MemConstant) {
                    res.add(n.name);
                }
            });
        }

        return res;
    }

    allocFreshMem(decl: MemIdentifier): string {
        const name = `__fresh_mem_${freshMemCtr++}`;

        if (this.memories.has(name)) {
            throw new Error(`Intenral Error: Fresh memory ${name} overwites an existing memory`);
        }

        this.memories.set(name, new Map());
        this.curMachFrame.freshMemories.set(decl, name);

        return name;
    }

    stackTrace(): string {
        return this.stack.map((frame) => frame.pp()).join("\n");
    }

    copyPrimitiveVal(v: PrimitiveValue): PrimitiveValue {
        if (v instanceof Array) {
            return [v[0], v[1]];
        }

        return v;
    }

    copyComplexVal(v: ComplexValue): ComplexValue {
        if (v instanceof Array) {
            return v.map(this.copyPrimitiveVal);
        }

        return new Map([...v.entries()].map((p) => [p[0], this.copyPrimitiveVal(p[1])]));
    }

    saveMemories(): void {
        const copy: Memories = new Map();

        for (const [label, store] of this.memories) {
            const newStore = new Map();

            for (const [ptr, complexVal] of store) {
                store.set(ptr, this.copyComplexVal(complexVal));
            }

            copy.set(label, newStore);
        }

        this.memoriesStack.push(copy);
    }

    popMemories(): Memories {
        if (this.memoriesStack.length === 0) {
            throw new Error(`Can't popMemories on an empty memory stack`);
        }

        const res = this.memoriesStack[this.memoriesStack.length - 1];

        this.memoriesStack.pop();

        return res;
    }

    dump(): string {
        const mems = [];
        const indent = " ".repeat(4);

        for (const [memName, memory] of this.memories) {
            const memContents = [];

            for (const [ptr, val] of memory) {
                memContents.push(`${ptr}: ${pp(val)}`);
            }

            mems.push(`${indent}${memName}: [${memContents.join("; ")}]`);
        }

        const stackStrs = this.stack.map((frame) => frame.dump(indent));

        stackStrs.reverse();

        return `Stack:\n${stackStrs.join("\n")}\nMemories:\n${mems.join("\n")}`;
    }

    private getNewPtr(memory: string): number {
        let curMax = this.maxMemPtr.get(memory);

        if (curMax === undefined) {
            const mem = this.memories.get(memory) as Memory;

            curMax = mem.size === 0 ? 0 : Math.max(...mem.keys()) + 1;
        }

        this.maxMemPtr.set(memory, curMax + 1);

        return curMax;
    }

    public define(val: ComplexValue, memory: string): PointerVal {
        const mem = this.memories.get(memory) as Memory;
        const ptr = this.getNewPtr(memory);

        mem.set(ptr, val);

        return [memory, ptr];
    }
}
