import { Node } from "../node";
import { BaseSrc } from "../source";
import { Type } from "../types";
import { Definition } from "./definition";

export class StructDefinition extends Definition {
    public readonly memoryParameters: string[];
    public readonly name: string;
    public readonly fields: Array<[string, Type]>;

    constructor(
        src: BaseSrc,
        memoryParameters: string[],
        name: string,
        fields: Array<[string, Type]>
    ) {
        super(src);
        this.memoryParameters = memoryParameters;
        this.name = name;
        this.fields = fields;
    }

    pp(): string {
        const memoryParamStr =
            this.memoryParameters.length > 0 ? `<${this.memoryParameters.join(", ")}>` : "";

        return `struct ${this.name}${memoryParamStr} {\n${this.fields
            .map(([name, typ]) => `    ${name}: ${typ.pp()};`)
            .join("\n\n")}\n}`;
    }

    getStructId(): any {
        return this.pp();
    }

    children(): Iterable<Node> {
        return this.fields.map((p) => p[1]);
    }
}
