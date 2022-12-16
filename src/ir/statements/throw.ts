import { Expression } from "../expressions";
import { Node } from "../node";
import { BaseSrc } from "../source";
import { TerminatorStmt } from "./terminator";

export class Throw extends TerminatorStmt {
    constructor(src: BaseSrc, public readonly val: Expression) {
        super(src);
    }

    pp(): string {
        return `throw ${this.val.pp()};`;
    }

    getStructId(): any {
        return this.pp();
    }

    children(): Iterable<Node> {
        return [this.val];
    }
}
