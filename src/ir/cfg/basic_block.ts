import { PPAble } from "../../utils";
import { copy } from "../copy";
import { Expression } from "../expressions";
import { Statement } from "../statements";
import { Edge } from "./edge";

export class BasicBlock implements PPAble {
    incoming: Edge[] = [];
    outgoing: Edge[] = [];

    constructor(
        public label: string,
        public statements: Statement[] = []
    ) {}

    addOutgoing(to: BasicBlock, predicate?: Expression): Edge {
        if (this.hasOutgoing(to)) {
            throw new Error("Can't add double edges");
        }

        const edge = new Edge(this, to, predicate);

        this.outgoing.push(edge);

        to.incoming.push(edge);

        return edge;
    }

    hasOutgoing(to: BasicBlock): boolean {
        for (const edge of this.outgoing) {
            if (edge.to === to) {
                return true;
            }
        }

        return false;
    }

    addIncoming(from: BasicBlock, predicate?: Expression): Edge {
        if (this.hasIncoming(from)) {
            throw new Error("Can't add double edges");
        }

        const edge = new Edge(from, this, predicate);

        this.incoming.push(edge);

        from.outgoing.push(edge);

        return edge;
    }

    hasIncoming(from: BasicBlock): boolean {
        for (const edge of this.incoming) {
            if (edge.from === from) {
                return true;
            }
        }

        return false;
    }

    /**
     * Perform a BFS traversal starting at the current basic block
     */
    bfs(cb: (n: BasicBlock) => any): void {
        const visited = new Set<BasicBlock>();
        const q: BasicBlock[] = [this];

        while (q.length > 0) {
            const cur = q.shift() as BasicBlock;

            if (visited.has(cur)) {
                continue;
            }

            visited.add(cur);

            cb(cur);

            for (const e of cur.outgoing) {
                if (!visited.has(e.to)) {
                    q.push(e.to);
                }
            }
        }
    }

    pp(): string {
        return `${this.label}:\n${this.statements.map((stmt) => `    ` + stmt.pp()).join("\n")}`;
    }

    /**
     * Creates a new copy of current BasicBlock, also copying its statements.
     * This method **does not copy any `Edge`s** to avoid possible confusion.
     */
    copy(): BasicBlock {
        return new BasicBlock(this.label, this.statements.map(copy));
    }

    print(): string {
        let bb = `Label: ${this.label}\n`;

        bb += "IRStatements:\n";

        for (const irStatement of this.statements) {
            bb += `${irStatement.pp()}\n`;
        }

        bb += "Incoming Edges:\n";

        for (const i of this.incoming) {
            bb += `${i.from.label} -> ${i.to.label}\n`;
        }

        bb += "Outgoing Edges:\n";

        for (const o of this.outgoing) {
            bb += `${o.from.label} -> ${o.to.label}\n`;
        }

        return bb;
    }

    *successors(): Iterable<BasicBlock> {
        for (const edge of this.outgoing) {
            yield edge.to;
        }
    }

    *predecessors(): Iterable<BasicBlock> {
        for (const edge of this.incoming) {
            yield edge.from;
        }
    }
}
