import { PPAble, getOrErr } from "../../utils";
import { TransformerFn, transform } from "../copy";
import { Expression } from "../expressions";
import { BasicBlock } from "./basic_block";

export class CFG implements PPAble {
    nodes: Map<string, BasicBlock>;

    constructor(
        nodes: BasicBlock[] | Map<string, BasicBlock>,
        public entry: BasicBlock,
        public exits: BasicBlock[]
    ) {
        if (nodes instanceof Array) {
            this.nodes = new Map();

            for (const node of nodes) {
                this.nodes.set(node.label, node);
            }
        } else {
            this.nodes = nodes;
        }
    }

    pp(): string {
        const strBbs: string[] = [];

        for (const bb of this.nodes.values()) {
            strBbs.push(bb.pp());
        }

        return `{\n${strBbs.join("\n")}\n}`;
    }

    copy(t: TransformerFn | undefined): CFG {
        const copies = new Map<string, BasicBlock>();
        const globalEdgeMap = new Map<BasicBlock, Map<string, Expression | undefined>>();

        for (const [name, originalBb] of this.nodes) {
            const copyBb = transform(originalBb, t);

            copies.set(name, copyBb);

            const edgeMap = new Map<string, Expression | undefined>();

            globalEdgeMap.set(copyBb, edgeMap);

            for (const edge of originalBb.outgoing) {
                edgeMap.set(
                    edge.to.label,
                    edge.predicate ? transform(edge.predicate, t) : edge.predicate
                );
            }
        }

        for (const [fromBb, edgeMap] of globalEdgeMap) {
            for (const [toLabel, predicate] of edgeMap) {
                const toBb = getOrErr(
                    copies,
                    toLabel,
                    `Missing basic block for label "${toLabel}"`
                );

                fromBb.addOutgoing(toBb, predicate);
            }
        }

        const entry = getOrErr(
            copies,
            this.entry.label,
            `Missing basic block for entry label "${this.entry.label}"`
        );

        const exits = this.exits.map((bb) =>
            getOrErr(copies, bb.label, `Missing basic block for exit label "${bb.label}"`)
        );

        return new CFG(copies, entry, exits);
    }
}
