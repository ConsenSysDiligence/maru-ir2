import { PPAble } from "../../utils";
import { BasicBlock } from "./basic_block";
import { Edge } from "./edge";

export class CFG<SrcT> implements PPAble {
    edges: Array<Edge<SrcT>>;
    nodes: Map<string, BasicBlock<SrcT>>;
    entry: BasicBlock<SrcT>;
    exits: Array<BasicBlock<SrcT>>;

    constructor(
        nodes: Array<BasicBlock<SrcT>>,
        edges: Array<Edge<SrcT>>,
        entry: BasicBlock<SrcT>,
        exits: Array<BasicBlock<SrcT>>
    ) {
        this.edges = edges;
        this.nodes = new Map();
        this.entry = entry;
        this.exits = exits;

        for (const node of nodes) {
            this.nodes.set(node.label, node);
        }
    }

    pp(): string {
        const nodes = [...this.nodes.values()];
        return `{
            ${nodes.map((bb) => bb.pp()).join("\n")}
        }`;
    }
}
