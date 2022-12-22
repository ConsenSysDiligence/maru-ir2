import { BaseSrc, Definition, FunctionDefinition, MemConstant } from "../ir";
import { BasicBlock } from "../ir/cfg";
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

export const EXCEPTION_MEM = "#exception";

export class Frame implements PPAble {
    fun: FunctionDefinition;
    curBB: BasicBlock;
    curBBInd: number;
    store: Store;

    constructor(fun: FunctionDefinition, args: Array<[string, PrimitiveValue]>) {
        this.fun = fun;
        if (!fun.body) {
            throw new Error(`Unexpected stack frame for function without body ${fun.name}`);
        }

        this.curBB = fun.body.entry;
        this.curBBInd = 0;
        this.store = new Map();

        for (const [argName, argVal] of args) {
            this.store.set(argName, argVal);
        }

        for (const locDecl of fun.locals) {
            this.store.set(locDecl.name, poison);
        }
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
}

export type Stack = Frame[];

export type Memory = Map<number, ComplexValue>;
export type Memories = Map<string, Memory>;

export type BuiltinFun = (s: State) => PrimitiveValue[];

export type Program = Definition[];

export class State {
    program: Program;
    stack: Stack;
    memories: Memories;
    builtins: Map<string, BuiltinFun>;
    externalReturns: any[] | undefined;
    private failure: InterpError | undefined;

    /**
     * Stack of memory copies created for each transaction call.
     */
    memoriesStack: Memories[];

    constructor(
        program: Definition[],
        entryFun: FunctionDefinition,
        entryFunArgs: PrimitiveValue[],
        builtins: Map<string, BuiltinFun>
    ) {
        this.program = program;
        this.stack = [
            new Frame(
                entryFun,
                zip(
                    entryFun.parameters.map((p) => p.name),
                    entryFunArgs
                )
            )
        ];
        this.memories = new Map();

        for (const memName of this.getInitialMemories(program)) {
            this.memories.set(memName, new Map());
        }
        this.builtins = builtins;
        this.memoriesStack = [];
        this.failure = undefined;
    }

    get curFrame(): Frame {
        return this.stack[this.stack.length - 1];
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
        const indent = "    ";

        for (const [memName, memory] of this.memories) {
            const memContents = [];

            for (const [ptr, val] of memory) {
                memContents.push(`${ptr}: ${pp(val)}`);
            }

            mems.push(`${indent}${memName}: [${memContents.join("; ")}]`);
        }

        return `Stack:\n${this.stack
            .map((frame) => frame.dump(indent))
            .join("\n")}\nMemories:\n${mems.join("\n")}`;
    }
}
