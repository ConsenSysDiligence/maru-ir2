import {
    Definition,
    FunctionDefinition,
    Identifier,
    StructDefinition,
    TypeVariableDeclaration,
    UserDefinedType,
    VariableDeclaration
} from "../ir";
import { walk, MIRTypeError } from "../utils";

export type TypeDecl = TypeVariableDeclaration | StructDefinition;
/**
 * Simple pass to compute:
 * 1. The VariableDeclaration for each Identifier
 * @todo 2. The FunctionDefinition for every name inside of a FunctionCall
 * 3. The @todo TypeVar definition/StructDefinition for every UserDefinedType
 */
export class Resolving {
    private _idDecls: Map<Identifier, VariableDeclaration>;
    private _typeDecls: Map<UserDefinedType, TypeDecl>;
    private nameToTypeDef: Map<string, StructDefinition>;

    constructor(public readonly defs: Definition[]) {
        this._idDecls = new Map();
        this._typeDecls = new Map();
        this.nameToTypeDef = new Map();

        this.runAnalysis();
    }

    getIdDecl(id: Identifier): VariableDeclaration | undefined {
        return this._idDecls.get(id);
    }

    getTypeDecl(id: UserDefinedType): TypeDecl | undefined {
        return this._typeDecls.get(id);
    }

    private runAnalysis(): void {
        for (const def of this.defs) {
            if (def instanceof StructDefinition) {
                this.nameToTypeDef.set(def.name, def);
            }
        }

        for (const def of this.defs) {
            if (def instanceof FunctionDefinition) {
                this.analyzeOneFun(def);
            }
        }
    }

    private analyzeOneFun(fun: FunctionDefinition) {
        const nameToDeclM = new Map<string, VariableDeclaration>();

        const addDef = (d: VariableDeclaration): void => {
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

        if (!fun.body) {
            return;
        }

        for (const bb of fun.body.nodes.values()) {
            for (const stmt of bb.statements) {
                walk(stmt, (nd) => {
                    if (nd instanceof Identifier) {
                        const decl = nameToDeclM.get(nd.name);

                        if (decl === undefined) {
                            throw new MIRTypeError(nd.src, `Unknown identifier ${nd.name}`);
                        }

                        this._idDecls.set(nd, decl);
                        return;
                    }

                    /// Resolution order is
                    /// 1. Function type params
                    /// 2. Global struct definitions
                    if (nd instanceof UserDefinedType) {
                        let res: TypeDecl | undefined;

                        for (const tVarDecl of fun.typeParameters) {
                            if (tVarDecl.name === nd.name) {
                                res = tVarDecl;
                                break;
                            }
                        }

                        if (res === undefined) {
                            res = this.nameToTypeDef.get(nd.name);
                        }

                        if (res === undefined) {
                            throw new MIRTypeError(nd, `Unknown user defined type ${nd.name}`);
                        }

                        this._typeDecls.set(nd, res);
                        return;
                    }
                });
            }
        }
    }
}
