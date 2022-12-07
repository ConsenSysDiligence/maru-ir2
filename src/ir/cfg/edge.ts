import { PPAble } from "../../utils";
import { Expression } from "../expressions";
import { BasicBlock } from "./basic_block";

export class Edge implements PPAble {
    from: BasicBlock;
    to: BasicBlock;
    predicate?: Expression;

    constructor(from: BasicBlock, to: BasicBlock, predicate?: Expression) {
        this.from = from;
        this.to = to;
        this.predicate = predicate;
    }

    pp(): string {
        const cond = this.predicate === undefined ? "true" : this.predicate.pp();

        return this.from.label + "-(" + cond + ")->" + this.to.label;
    }
}
