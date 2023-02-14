import { PPAble } from "../../utils";
import { BasicBlock } from "./basic_block";

export class CFG implements PPAble {
    nodes: Map<string, BasicBlock>;
    entry: BasicBlock;
    exits: BasicBlock[];

    constructor(nodes: BasicBlock[], entry: BasicBlock, exits: BasicBlock[]) {
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
