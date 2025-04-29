import { Node } from "../node";
import { BaseSrc } from "../source";
import { TerminatorStmt } from "./terminator";

export class Jump extends TerminatorStmt {
    constructor(
        src: BaseSrc,
        public readonly label: string
    ) {
        super(src);
    }

    pp(): string {
        return `jump ${this.label};`;
    }

    getStructId(): any {
        return this.pp();
    }

    children(): Iterable<Node> {
        return [];
    }

    copy(): Jump {
        return new Jump(this.src, this.label);
    }
}
