import { PPAble } from "../../utils";
import { Expression } from "../expressions";
import { BasicBlock } from "./basic_block";

export class Edge implements PPAble {
    constructor(
        public from: BasicBlock,
        public to: BasicBlock,
        public predicate?: Expression
    ) {}

    pp(): string {
        const cond = this.predicate === undefined ? "true" : this.predicate.pp();

        return this.from.label + "-(" + cond + ")->" + this.to.label;
    }
}
