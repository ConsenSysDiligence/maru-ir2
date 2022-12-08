import { TypeVariableDeclaration } from "../misc";
import { Node } from "../node";
import { BaseSrc } from "../source";
import { Type } from "../types";
import { Definition } from "./definition";

export class StructDefinition extends Definition {
    public readonly typeParameters: TypeVariableDeclaration[];
    public readonly memoryParameters: string[];
    public readonly name: string;
    public readonly fields: Array<[string, Type]>;

    constructor(
        src: BaseSrc,
        memoryParameters: string[],
        typeParameters: TypeVariableDeclaration[],
        name: string,
        fields: Array<[string, Type]>
    ) {
        super(src);
        this.typeParameters = typeParameters;
        this.memoryParameters = memoryParameters;
        this.name = name;
        this.fields = fields;
    }

    pp(): string {
        const typeParamStr =
            this.typeParameters.length > 0
                ? `<${this.typeParameters.map((tp) => tp.pp()).join(", ")}>`
                : "";
        const memoryParamStr =
            this.memoryParameters.length > 0 ? `[${this.memoryParameters.join(", ")}]` : "";

        return `struct${memoryParamStr}${typeParamStr} ${this.name} {\n${this.fields
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
