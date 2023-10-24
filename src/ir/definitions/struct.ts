import { ppPolyParams } from "../../utils";
import { TransformerFn, transform } from "../copy";
import { MemVariableDeclaration, TypeVariableDeclaration } from "../misc";
import { Node } from "../node";
import { BaseSrc } from "../source";
import { Type } from "../types";
import { Definition } from "./definition";

export class StructDefinition extends Definition {
    constructor(
        src: BaseSrc,
        public readonly memoryParameters: MemVariableDeclaration[],
        public readonly typeParameters: TypeVariableDeclaration[],
        public readonly name: string,
        public readonly fields: Array<[string, Type]>
    ) {
        super(src);
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

    copy(t: TransformerFn | undefined): StructDefinition {
        return new StructDefinition(
            this.src,
            this.memoryParameters.map((mParam) => transform(mParam, t)),
            this.typeParameters.map((tParam) => transform(tParam, t)),
            this.name,
            this.fields.map(([k, v]) => [k, transform(v, t)])
        );
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
