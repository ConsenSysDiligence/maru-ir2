import {
    BaseSrc,
    Definition,
    FunctionDefinition,
    Identifier,
    MemVariableDeclaration,
    StructDefinition,
    UserDefinedType,
    VariableDeclaration
} from "../ir";
import { walk, MIRTypeError } from "../utils";

export type TypeDecl = StructDefinition;
/**
 * Simple pass to compute:
 * 1. The VariableDeclaration for each Identifier
 * @todo 2. The FunctionDefinition for every name inside of a FunctionCall
 * 3. The @todo StructDefinition for every UserDefinedType
 */
export class Resolving {
    private _idDecls: Map<
        Identifier,
        VariableDeclaration | MemVariableDeclaration | FunctionDefinition
    >;
    private _typeDecls: Map<UserDefinedType, TypeDecl>;
    private nameToTopLevelDef: Map<string, StructDefinition | FunctionDefinition>;

    constructor(public readonly defs: Definition[]) {
        this._idDecls = new Map();
        this._typeDecls = new Map();
        this.nameToTopLevelDef = new Map();

        this.runAnalysis();
    }

    getIdDecl(
        id: Identifier
    ): VariableDeclaration | MemVariableDeclaration | FunctionDefinition | undefined {
        return this._idDecls.get(id);
    }

    getTypeDecl(id: UserDefinedType): TypeDecl | undefined {
        return this._typeDecls.get(id);
    }

    private runAnalysis(): void {
        for (const def of this.defs) {
            if (def instanceof StructDefinition || def instanceof FunctionDefinition) {
                this.nameToTopLevelDef.set(def.name, def);
            }
        }

        for (const def of this.defs) {
            if (def instanceof FunctionDefinition) {
                this.analyzeOneFun(def);
            } else if (def instanceof StructDefinition) {
                this.analyzeOneStruct(def);
            }
        }
    }

    private analyzeOneStruct(struct: StructDefinition) {
        const nameToDeclM = new Map<string, MemVariableDeclaration>();

        for (const memVar of struct.memoryParameters) {
            nameToDeclM.set(memVar.name, memVar);
        }

        walk(struct, (nd) => {
            if (nd instanceof Identifier) {
                const decl = nameToDeclM.get(nd.name);

                if (decl === undefined) {
                    throw new MIRTypeError(nd.src, `Unknown identifier ${nd.name}`);
                }

                this._idDecls.set(nd, decl);
                return;
            }

            if (nd instanceof UserDefinedType) {
                this._typeDecls.set(nd, this.getStruct(nd.name, nd.src));
                return;
            }
        });
    }

    private getStruct(name: string, loc: BaseSrc): StructDefinition {
        const res = this.nameToTopLevelDef.get(name);

        if (res === undefined) {
            throw new MIRTypeError(loc, `Unknown user defined type ${name}`);
        }

        if (res instanceof FunctionDefinition) {
            throw new MIRTypeError(loc, `Expected struct, not function definition ${name}`);
        }

        return res;
    }

    private analyzeOneFun(fun: FunctionDefinition) {
        const nameToDeclM = new Map<string, VariableDeclaration | MemVariableDeclaration>();

        const addDef = (d: VariableDeclaration | MemVariableDeclaration): void => {
            if (nameToDeclM.has(d.name)) {
                throw new MIRTypeError(
                    d.src,
                    `Multiple variables/parameters with name ${d.name} in function ${fun.name}`
                );
            }

            nameToDeclM.set(d.name, d);
        };

        fun.parameters.forEach(addDef);
        fun.locals.forEach(addDef);
        fun.memoryParameters.forEach(addDef);

        for (const child of fun.children()) {
            walk(child, (nd) => {
                if (nd instanceof Identifier) {
                    let decl = nameToDeclM.get(nd.name);

                    /// @todo (@dimo) Ugly code. Should have proper scopes. Just lazy
                    if (decl !== undefined) {
                        this._idDecls.set(nd, decl);
                        return;
                    }

                    decl = this.nameToTopLevelDef.get(nd.name);

                    if (decl === undefined) {
                        throw new MIRTypeError(nd.src, `Unknown identifier ${nd.name}`);
                    }

                    this._idDecls.set(nd, decl);
                    return;
                }

                if (nd instanceof UserDefinedType) {
                    this._typeDecls.set(nd, this.getStruct(nd.name, nd.src));
                    return;
                }
            });
        }
    }
}
