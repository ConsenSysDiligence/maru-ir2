import expect from "expect";
import fse from "fs-extra";
import { Abort, BaseSrc, Node, nodeToPlain, noSrc, parseProgram, plainToNode } from "../src";
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

describe("nodeToPlain/plainToNode coversion tests", () => {
    describe("Roundtrip", () => {
        const files = searchRecursive("test/samples/valid", (name) => name.endsWith(".maruir"));

        for (const file of files) {
            it(file, () => {
                const contents = fse.readFileSync(file, { encoding: "utf-8" });

                const originalDefs = parseProgram(contents);
                const plainDefs = originalDefs.map(nodeToPlain);
                const importedDefs = plainDefs.map(plainToNode);

                for (let i = 0; i < originalDefs.length; i++) {
                    const originalDef = originalDefs[i];
                    const importedDef = importedDefs[i];

                    expect(importedDef.pp()).toEqual(originalDef.pp());
                }
            });
        }
    });

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

    it("Error is thrown on unsupported plain representation", () => {
        const node = {
            id: 0,
            nodeType: "CustomNode"
        };

        expect(() => plainToNode(node)).toThrow(
            `Unable to handle plain representation {"id":0,"nodeType":"CustomNode"}`
        );
    });

    it("Error is thrown on unsupported plain source location", () => {
        const node = {
            id: 0,
            nodeType: "Abort",
            src: {} as any
        };

        expect(() => plainToNode(node)).toThrow(`Unable to handle plain source location {}`);
    });
});
