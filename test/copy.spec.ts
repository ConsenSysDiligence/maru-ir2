import expect from "expect";
import fse from "fs-extra";
import { Abort, BasicBlock, CFG, copy, noSrc, parseProgram } from "../src";
import { CustomNode, CustomSrc, searchRecursive } from "./utils";

describe("copy()/copySrc()/copyCfg()/copyNode() tests", () => {
    describe("Samples", () => {
        const files = searchRecursive("test/samples/valid", (name) => name.endsWith(".maruir"));

        for (const file of files) {
            it(file, () => {
                const contents = fse.readFileSync(file, { encoding: "utf-8" });

                const originalProgram = parseProgram(contents);
                const copiedProgram = originalProgram.map(copy);

                for (let i = 0; i < originalProgram.length; i++) {
                    const originalDef = originalProgram[i];
                    const copiedDef = copiedProgram[i];

                    expect(copiedDef !== originalDef).toBeTruthy();
                    expect(copiedDef.pp()).toEqual(originalDef.pp());
                }
            });
        }
    });

    it("copy() on NoSrc", () => {
        expect(copy(noSrc) === noSrc).toBeTruthy();
    });

    it("copy() on CFG", () => {
        const entry = new BasicBlock("test");
        const originalCfg = new CFG([entry], entry, []);
        const copiedCfg = copy(originalCfg);

        expect(originalCfg !== copiedCfg).toBeTruthy();
        expect(copiedCfg.pp()).toEqual(originalCfg.pp());
    });

    it("Error is thrown on unsupported node", () => {
        const node = new CustomNode(noSrc);

        expect(() => copy(node)).toThrow(`Unable to copy node "${node.constructor.name}"`);
    });

    it("Error is thrown on unsupported source location", () => {
        const src = new CustomSrc();
        const node = new Abort(src);

        expect(() => copy(node)).toThrow(
            `Unable to copy source location "${src.constructor.name}"`
        );
    });
});
