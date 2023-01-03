import expect from "expect";
import { BasicBlock } from "../src/ir/cfg";

describe("BasicBlock unit tests", () => {
    it("Outgoing", () => {
        const base = new BasicBlock("base");
        const outgoing = new BasicBlock("outgoing");

        base.addOutgoing(outgoing);

        expect(base.hasOutgoing(outgoing)).toEqual(true);
        expect(base.hasIncoming(outgoing)).toEqual(false);
        expect(base.successors()).toContain(outgoing);
        expect(base.predecessors()).not.toContain(outgoing);

        expect(outgoing.hasOutgoing(base)).toEqual(false);
        expect(outgoing.hasIncoming(base)).toEqual(true);
        expect(outgoing.successors()).not.toContain(base);
        expect(outgoing.predecessors()).toContain(base);

        expect(() => base.addOutgoing(outgoing)).toThrow();
    });

    it("Incoming", () => {
        const base = new BasicBlock("base");
        const incoming = new BasicBlock("incoming");

        base.addIncoming(incoming);

        expect(base.hasOutgoing(incoming)).toEqual(false);
        expect(base.hasIncoming(incoming)).toEqual(true);
        expect(base.successors()).not.toContain(incoming);
        expect(base.predecessors()).toContain(incoming);

        expect(incoming.hasOutgoing(base)).toEqual(true);
        expect(incoming.hasIncoming(base)).toEqual(false);
        expect(incoming.successors()).toContain(base);
        expect(incoming.predecessors()).not.toContain(base);

        expect(() => base.addIncoming(incoming)).toThrow();
    });

    it("bfs()", () => {
        const a = new BasicBlock("A");
        const b = new BasicBlock("B");
        const c = new BasicBlock("C");

        a.addOutgoing(b);
        b.addOutgoing(c);
        c.addOutgoing(a);

        const bfsA: BasicBlock[] = [];

        expect(() => a.bfs((bb) => bfsA.push(bb))).not.toThrow();

        expect(bfsA).toEqual([a, b, c]);

        const bfsB: BasicBlock[] = [];

        expect(() => b.bfs((bb) => bfsB.push(bb))).not.toThrow();

        expect(bfsB).toEqual([b, c, a]);

        const bfsC: BasicBlock[] = [];

        expect(() => c.bfs((bb) => bfsC.push(bb))).not.toThrow();

        expect(bfsC).toEqual([c, a, b]);
    });

    it("print()", () => {
        const a = new BasicBlock("A");
        const b = new BasicBlock("B");
        const c = new BasicBlock("C");

        a.addOutgoing(b);
        b.addOutgoing(c);
        a.addIncoming(c);

        expect(a.print()).toEqual(
            `Label: A
IRStatements:
Incoming Edges:
C ->  A
Outgoing Edges:
A ->  B
`
        );

        expect(b.print()).toEqual(
            `Label: B
IRStatements:
Incoming Edges:
A ->  B
Outgoing Edges:
B ->  C
`
        );

        expect(c.print()).toEqual(
            `Label: C
IRStatements:
Incoming Edges:
B ->  C
Outgoing Edges:
C ->  A
`
        );
    });
});
