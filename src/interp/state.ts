import { Definition, FunctionDefinition, MemConstant } from "../ir";
import { BasicBlock } from "../ir/cfg";
import { PPAble, walk, zip } from "../utils";

export type PointerVal = [string, number];
export type PrimitiveValue = bigint | boolean | PointerVal;

export type ComplexValue = PrimitiveValue[] | Map<string, PrimitiveValue>;

export type Store = Map<string, PrimitiveValue>;

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
    }

    pp(): string {
        return `${this.fun.name}:${this.curBB.label}:${this.curBBInd} ${this.curBB.statements[
            this.curBBInd
        ].pp()}`;
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
    }

    get curFrame(): Frame {
        return this.stack[this.stack.length - 1];
    }

    /// Compute the initial set of memories needed by walking over all trees
    /// and accumulating all memory constants
    private getInitialMemories(program: Program): Iterable<string> {
        const res = new Set<string>();

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
}
