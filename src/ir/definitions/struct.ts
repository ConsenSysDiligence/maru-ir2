import { Type } from "../types";
import { Definition } from "./definition";

export class StructDefinition<SrcT> extends Definition<SrcT> {
    public readonly typeParameters: string[];
    public readonly memoryParameters: string[];
    public readonly name: string;
    public readonly fields: Array<[string, Type<SrcT>]>;

    constructor(
        id: number,
        src: SrcT,
        typeParameters: string[],
        memoryParameters: string[],
        name: string,
        fields: Array<[string, Type<SrcT>]>
    ) {
        super(id, src);
        this.typeParameters = typeParameters;
        this.memoryParameters = memoryParameters;
        this.name = name;
        this.fields = fields;
    }

    pp(): string {
        const typeParamStr =
            this.typeParameters.length > 0 ? `[${this.typeParameters.join(", ")}]` : "";
        const memoryParamStr =
            this.memoryParameters.length > 0 ? `<${this.memoryParameters.join(", ")}>` : "";

        return `struct${typeParamStr}${memoryParamStr} ${this.name} {\n${this.fields
            .map(([name, typ]) => `    ${name}: ${typ.pp()};`)
            .join("\n\n")}\n}`;
    }

    getStructId(): any {
        return this.pp();
    }
}
