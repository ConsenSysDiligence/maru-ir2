import expect from "expect";
import fse from "fs-extra";
import { Abort, nodeToPlain, noSrc, parseProgram, plainToNode, traverse } from "../src";
import { CustomNode, CustomSrc, searchRecursive } from "./utils";

describe("nodeToPlain()/plainToNode() tests", () => {
    describe("Roundtrip", () => {
        const files = searchRecursive("test/samples/valid", (name) => name.endsWith(".maruir"));

        for (const file of files) {
            it(file, async () => {
                const contents = await fse.readFile(file, { encoding: "utf-8" });

                const originalProgram = parseProgram(contents);
                const plainProgram = originalProgram.map(nodeToPlain);
                const importedProgram = plainProgram.map(plainToNode);

                const originalNodes = originalProgram.map((def) => [...traverse(def)]).flat();
                const importedNodes = importedProgram.map((def) => [...traverse(def)]).flat();

                expect(originalNodes.length).toEqual(importedNodes.length);

                for (let i = 0; i < originalNodes.length; i++) {
                    const originalNode = originalNodes[i];
                    const copiedNode = importedNodes[i];

                    expect(copiedNode !== originalNode).toBeTruthy();
                    expect(copiedNode.pp()).toEqual(originalNode.pp());
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
