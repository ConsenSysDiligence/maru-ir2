import { PPAble } from "../../utils";
import { Expression } from "../expressions";
import { BasicBlock } from "./basic_block";

export class Edge<SrcT> implements PPAble {
    from: BasicBlock<SrcT>;
    to: BasicBlock<SrcT>;
    predicate?: Expression<SrcT>;

    constructor(from: BasicBlock<SrcT>, to: BasicBlock<SrcT>, predicate?: Expression<SrcT>) {
        this.from = from;
        this.to = to;
        this.predicate = predicate;
    }

    pp(): string {
        const cond = this.predicate === undefined ? "true" : this.predicate.pp();

        return this.from.label + "-(" + cond + ")->" + this.to.label;
    }
}
