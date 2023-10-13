import { Node } from "../node";
import { BaseSrc } from "../source";
import { TerminatorStmt } from "./terminator";

export class Abort extends TerminatorStmt {
    constructor(src: BaseSrc) {
        super(src);
    }

    pp(): string {
        return `abort;`;
    }

    getStructId(): any {
        return this.pp();
    }

    children(): Iterable<Node> {
        return [];
    }

    copy(): Abort {
        return new Abort(this.src);
    }
}
