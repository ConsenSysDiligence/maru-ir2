import { Node } from "../node";
import { TerminatorStmt } from "./terminator";

export class Jump<SrcT> extends TerminatorStmt<SrcT> {
    constructor(id: number, src: SrcT, public readonly label: string) {
        super(id, src);
    }

    pp(): string {
        return `jump ${this.label};`;
    }

    getStructId(): any {
        return this.pp();
    }

    children(): Iterable<Node<SrcT>> {
        return [];
    }
}
