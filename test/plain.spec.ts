import expect from "expect";
import fse from "fs-extra";
import { Abort, BaseSrc, Node, nodeToPlain, noSrc, parseProgram } from "../src";
import { searchRecursive } from "./utils";

class CustomSrc extends BaseSrc {
    pp(): string {
        return "<custom>";
    }
}

class CustomNode extends Node {
    children(): Iterable<Node> {
        return [];
    }

    pp(): string {
        return "<custom>";
    }

    getStructId(): any {
        return [];
    }
}

describe("Node-to-plain coversion unit test", () => {
    const files = searchRecursive("test/samples/valid", (name) => name.endsWith(".maruir"));

    for (const file of files) {
        it(file, () => {
            const contents = fse.readFileSync(file, { encoding: "utf-8" });
            const defs = parseProgram(contents);

            expect(() => defs.forEach(nodeToPlain)).not.toThrow();
        });
    }

    it("Error is thrown on unsupported node", () => {
        const node = new CustomNode(noSrc);

        expect(() => nodeToPlain(node)).toThrow(
            `Unable to produce plain representation for node "${node.constructor.name}"`
        );
    });

    it("Error is thrown on unsupported source location", () => {
        const src = new CustomSrc();
        const node = new Abort(src);

        expect(() => nodeToPlain(node)).toThrow(
            `Unable to produce plain representation for source location "${src.constructor.name}"`
        );
    });
});
