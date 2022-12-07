import { PPAble } from "../../utils";
import { BasicBlock } from "./basic_block";
import { Edge } from "./edge";

export class CFG implements PPAble {
    edges: Edge[];
    nodes: Map<string, BasicBlock>;
    entry: BasicBlock;
    exits: BasicBlock[];

    constructor(nodes: BasicBlock[], edges: Edge[], entry: BasicBlock, exits: BasicBlock[]) {
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
        return `{\n${nodes.map((bb) => bb.pp()).join("\n")}\n}`;
    }
}
