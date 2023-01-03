import expect from "expect";
import fse from "fs-extra";
import { parseProgram } from "../src";
import { searchRecursive } from "./utils";

describe("Parser/printer roundtrip test", () => {
    const files = searchRecursive("test/samples/valid", (name) => name.endsWith(".maruir"));

    for (const file of files) {
        it(file, () => {
            const contents = fse.readFileSync(file, { encoding: "utf-8" });

            const defs = parseProgram(contents);

            const newContents = defs.map((d) => d.pp()).join("\n");

            //console.error(newContents);
            const newDefs = parseProgram(newContents);

            const newContents2 = newDefs.map((d) => d.pp()).join("\n");

            expect(newContents).toEqual(newContents2);
        });
    }
});
