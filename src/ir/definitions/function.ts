import { ppPolyParams } from "../../utils";
import { CFG } from "../cfg";
import { TransformerFn, transform } from "../copy";
import { MemVariableDeclaration, TypeVariableDeclaration, VariableDeclaration } from "../misc";
import { Node } from "../node";
import { BaseSrc } from "../source";
import { Type } from "../types";
import { Definition } from "./definition";

export class FunctionDefinition extends Definition {
    constructor(
        src: BaseSrc,
        public readonly memoryParameters: MemVariableDeclaration[],
        public readonly typeParameters: TypeVariableDeclaration[],
        public readonly name: string,
        public readonly parameters: VariableDeclaration[],
        public readonly locals: VariableDeclaration[],
        public readonly returns: Type[],
        public body?: CFG
    ) {
        super(src);
    }

    pp(): string {
        const memoryParamStr = ppPolyParams(this.memoryParameters, this.typeParameters);

        const returnStr =
            this.returns.length === 0
                ? ""
                : this.returns.length === 1
                  ? `: ${this.returns[0].pp()}`
                  : `: (${this.returns.map((x) => x.pp()).join(", ")})`;

        const localsStr =
            this.locals.length === 0
                ? ""
                : `\nlocals ${this.locals.map((d) => `${d.name}: ${d.type.pp()}`).join(", ")};`;

        const bodyStr = this.body ? " " + this.body.pp() : "";

        return `fun ${this.name}${memoryParamStr}(${this.parameters
            .map((decl) => decl.pp())
            .join(", ")})${returnStr}${localsStr}${bodyStr}`;
    }

    getStructId(): any {
        return this.pp();
    }

    children(): Iterable<Node> {
        const bodyChildren: Node[] = [];

        if (this.body) {
            for (const bb of this.body.nodes.values()) {
                bodyChildren.push(...bb.statements);

                for (const edge of bb.outgoing) {
                    if (edge.predicate) {
                        bodyChildren.push(edge.predicate);
                    }
                }
            }
        }

        return [
            ...this.typeParameters,
            ...this.memoryParameters,
            ...this.parameters,
            ...this.locals,
            ...this.returns,
            ...bodyChildren
        ];
    }

    copy(t: TransformerFn | undefined): FunctionDefinition {
        return new FunctionDefinition(
            this.src,
            this.memoryParameters.map((mParam) => transform(mParam, t)),
            this.typeParameters.map((tParam) => transform(tParam, t)),
            this.name,
            this.parameters.map((param) => transform(param, t)),
            this.locals.map((loc) => transform(loc, t)),
            this.returns.map((ret) => transform(ret, t)),
            this.body ? this.body.copy(t) : undefined
        );
    }
}
