import expect from "expect";
import fse from "fs-extra";
import { nodeToPlain, parseProgram } from "../src";
import { searchRecursive } from "./utils";

describe("Node-to-plain coversion unit test", () => {
    const files = searchRecursive("test/samples/valid", (name) => name.endsWith(".maruir"));

    for (const file of files) {
        it(file, () => {
            const contents = fse.readFileSync(file, { encoding: "utf-8" });

            const defs = parseProgram(contents);
            const plainDefs = defs.map(nodeToPlain);

            expect(plainDefs.length).toBeGreaterThan(0);
        });
    }
});
