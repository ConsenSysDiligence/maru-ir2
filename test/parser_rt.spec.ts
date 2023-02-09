import expect from "expect";
import fse from "fs-extra";
import { parseProgram } from "../src";
import { searchRecursive } from "./utils";

describe("Parser/printer roundtrip test", () => {
    const files = searchRecursive("test/samples/valid", (name) => name.endsWith(".maruir"));

    for (const file of files) {
        it(file, () => {
            const contents = fse.readFileSync(file, { encoding: "utf-8" });

            const program = parseProgram(contents);

            const newContents = program.map((def) => def.pp()).join("\n");

            //console.error(newContents);
            const newProgram = parseProgram(newContents);

            const newContents2 = newProgram.map((def) => def.pp()).join("\n");

            expect(newContents).toEqual(newContents2);
        });
    }
});
