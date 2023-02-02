import { ppPolyParams } from "../../utils";
import { MemVariableDeclaration, TypeVariableDeclaration } from "../misc";
import { Node } from "../node";
import { BaseSrc } from "../source";
import { Type } from "../types";
import { Definition } from "./definition";

export class StructDefinition extends Definition {
    public readonly memoryParameters: MemVariableDeclaration[];
    public readonly typeParameters: TypeVariableDeclaration[];
    public readonly name: string;
    public readonly fields: Array<[string, Type]>;

    constructor(
        src: BaseSrc,
        memoryParameters: MemVariableDeclaration[],
        typeParameters: TypeVariableDeclaration[],
        name: string,
        fields: Array<[string, Type]>
    ) {
        super(src);
        this.memoryParameters = memoryParameters;
        this.typeParameters = typeParameters;
        this.name = name;
        this.fields = fields;
    }

    pp(): string {
        return `struct ${this.name}${ppPolyParams(
            this.memoryParameters,
            this.typeParameters
        )} {\n${this.fields.map(([name, typ]) => `    ${name}: ${typ.pp()};`).join("\n\n")}\n}`;
    }

    getStructId(): any {
        return this.pp();
    }

    children(): Iterable<Node> {
        return [...this.fields.map((p) => p[1]), ...this.memoryParameters, ...this.typeParameters];
    }

    getFieldType(name: string): Type | undefined {
        for (const [field, fieldT] of this.fields) {
            if (field === name) {
                return fieldT;
            }
        }

        return undefined;
    }
}
