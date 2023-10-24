import { Program } from "../interp";
import {
    ArrayType,
    BoolType,
    CFG,
    FunctionCall,
    FunctionDefinition,
    GlobalVariable,
    Identifier,
    IntType,
    MemConstant,
    MemIdentifier,
    Node,
    PointerType,
    StructDefinition,
    Type,
    UserDefinedType,
    copy,
    transform
} from "../ir";
import { assert, forAll, walk, zip } from "../utils";
import { concretizeMemDesc, concretizeType, isConcrete, walkType } from "./poly";
import { Resolving, Scope, Substitution } from "./resolving";

export type MonomorphicDefM = Map<
    string,
    [StructDefinition | FunctionDefinition, [MemConstant[], Type[]]]
>;

export type TopLevelDef = FunctionDefinition | StructDefinition | GlobalVariable;
/**
 * Return true IFF the top-level `def` is polymorphic (i.e. has type/mem variables)
 */
function isDefPoly(def: TopLevelDef): boolean {
    if (def instanceof GlobalVariable) {
        return false;
    }

    return def.memoryParameters.length > 0 || def.typeParameters.length > 0;
}

export class Monomorphize {
    constructor(
        private readonly program: Program,
        private readonly resolving: Resolving
    ) {}

    /**
     * Given a *concrete* type t, compute a unique string representing t that can be used
     * in the name of a monomorphic variant
     */
    private getConcreteTypeIdentifier(t: Type): string {
        if (t instanceof PointerType) {
            return `ptr_${t.region.name}_${this.getConcreteTypeIdentifier(t.toType)}`;
        }

        if (t instanceof ArrayType) {
            return `arr_${this.getConcreteTypeIdentifier(t.baseType)}`;
        }

        if (t instanceof UserDefinedType) {
            return `usr_${t.name}$${t.memArgs.map((mArg) => mArg.name).join("_")}$${t.typeArgs
                .map((tArg) => this.getConcreteTypeIdentifier(tArg))
                .join("_")}`;
        }

        if (t instanceof IntType || t instanceof BoolType) {
            return t.pp();
        }

        throw new Error(`NYI getConcreteTypeIdentifier(${t.pp()})`);
    }

    /**
     * Given a struct or function definition `def`, and a list of *concrete* memories and types with which
     * it is to be instantiated, compute the monomorphic name for `def`.
     */
    private getMonoName(
        def: StructDefinition | FunctionDefinition,
        concreteMems: MemConstant[],
        concreteTypes: Type[]
    ): string {
        return `${def.name}$${concreteMems.map((m) => m.name).join("_")}$${concreteTypes
            .map((t) => this.getConcreteTypeIdentifier(t))
            .join("_")}`;
    }

    /**
     * Given a *concrete* type t, walk over all its sub-types (and recursively
     * the field types of any referenced structs) and build a map from the
     * monomrphic names of any concrete polymorphic type instances, to the
     * corresponding original def and the concrete memories/types with which
     * they are instantiated.
     */
    private accumulateConcreteStructDefs(t: Type, scope: Scope): MonomorphicDefM {
        const res: MonomorphicDefM = new Map();

        assert(isConcrete(t, scope), `Unexpected non-concrete type {0}`, t);

        walkType(
            t,
            (subT) => {
                if (!(subT instanceof UserDefinedType)) {
                    return;
                }

                // Not a polymorphic type. Not interesting.
                if (subT.memArgs.length === 0 && subT.typeArgs.length === 0) {
                    return;
                }

                const def = scope.getTypeDecl(subT);

                if (!(def instanceof StructDefinition)) {
                    return;
                }

                assert(isConcrete(subT, scope), `Unexpected non-concrete sub type {0}`, t);
                // subT is already concrete here (thanks to walkType)
                const name = this.getMonoName(def, subT.memArgs, subT.typeArgs);
                res.set(name, [def, [subT.memArgs, subT.typeArgs]]);
            },
            scope
        );

        return res;
    }

    private accumulateMonomorphicVariants(p: Program): MonomorphicDefM {
        const monomorphicDefs: MonomorphicDefM = new Map();

        // Gather monomorphic structs from global variables
        for (const def of p) {
            if (def instanceof GlobalVariable) {
                // def.type must already be concrete here
                for (const [name, entry] of this.accumulateConcreteStructDefs(
                    def.type,
                    this.resolving.global
                )) {
                    monomorphicDefs.set(name, entry);
                }
            }

            if (
                def instanceof StructDefinition &&
                def.memoryParameters.length === 0 &&
                def.typeParameters.length === 0
            ) {
                for (const [, fieldT] of def.fields) {
                    for (const [name, entry] of this.accumulateConcreteStructDefs(
                        fieldT,
                        this.resolving.global
                    )) {
                        monomorphicDefs.set(name, entry);
                    }
                }
            }
        }

        // Initialize worklist
        const wl: Array<[FunctionDefinition, [MemConstant[], Type[]]]> = [];
        for (const def of p) {
            if (
                !(
                    def instanceof FunctionDefinition &&
                    def.memoryParameters.length === 0 &&
                    def.typeParameters.length === 0
                )
            ) {
                continue;
            }

            wl.push([def, [[], []]]);
        }

        const visited = new Set<string>();

        // Iterate till fixpoint:
        //  1. Get a monomorphic function variant F
        //  2. Add F to the monomorphic map
        //  2. Walk over all types in F, concretize them, and add them to the monomorphic map
        //  3. Walk over all functon calls in F, concretize the callee, and add it to the worklist
        while (wl.length > 0) {
            const [fun, [mems, types]] = wl.pop() as [FunctionDefinition, [MemConstant[], Type[]]];

            const name = this.getMonoName(fun, mems, types);

            // Already found this variant
            if (visited.has(name)) {
                continue;
            }

            visited.add(name);

            if (mems.length > 0 || types.length > 0) {
                monomorphicDefs.set(name, [fun, [mems, types]]);
            }

            const subst: Substitution = [
                new Map(zip(fun.memoryParameters, mems)),
                new Map(zip(fun.typeParameters, types))
            ];
            const funScope = this.resolving.getScope(fun);

            walk(fun, (nd) => {
                if (nd instanceof Type) {
                    const concreteT = concretizeType(nd, subst, funScope);
                    for (const [name, entry] of this.accumulateConcreteStructDefs(
                        concreteT,
                        funScope
                    )) {
                        monomorphicDefs.set(name, entry);
                    }
                }

                if (nd instanceof FunctionCall) {
                    const concreteMems = nd.memArgs.map((memDesc) =>
                        concretizeMemDesc(memDesc, subst[0], funScope)
                    );
                    const concreteTypes = nd.typeArgs.map((tArg) =>
                        concretizeType(tArg, subst, funScope)
                    );
                    const callee = this.resolving.global.get(nd.callee.name) as FunctionDefinition;

                    wl.push([callee, [concreteMems, concreteTypes]]);
                }
            });
        }

        return monomorphicDefs;
    }

    private replaceConcretePolyTypes(t: Type, scope: Scope): Type {
        return transform(t, (subT) => {
            if (
                !(
                    subT instanceof UserDefinedType &&
                    (subT.memArgs.length > 0 || subT.typeArgs.length > 0)
                )
            ) {
                return undefined;
            }

            const def = scope.get(subT.name);

            if (!(def instanceof StructDefinition)) {
                return undefined;
            }

            const concreteName = this.getMonoName(
                def,
                subT.memArgs as MemConstant[],
                subT.typeArgs
            );

            return new UserDefinedType(subT.src, concreteName, [], []);
        });
    }

    private replacePolymorphicNodes<T extends Node | CFG>(
        def: T,
        scope: Scope,
        subst: Substitution
    ): T {
        return transform(def, (n) => {
            if (n instanceof Type) {
                const concreteT = concretizeType(n, subst, scope);

                return this.replaceConcretePolyTypes(concreteT, scope);
            }

            if (n instanceof MemIdentifier) {
                const concreteMem = concretizeMemDesc(n, subst[0], scope);

                assert(
                    concreteMem instanceof MemConstant,
                    `Unexpected non-concretized {0} in {1}`,
                    n,
                    def
                );

                return concreteMem;
            }

            // Polymorphic fun call
            if (n instanceof FunctionCall && (n.memArgs.length > 0 || n.typeArgs.length > 0)) {
                const nDef = scope.get(n.callee.name);

                assert(
                    nDef instanceof FunctionDefinition,
                    `Unexpected def {0} in replacePolymorphicNodes on call {1}`,
                    def,
                    n
                );

                const concreteMems = n.memArgs.map((mArg) =>
                    concretizeMemDesc(mArg, subst[0], scope)
                );
                const concreteTs = n.typeArgs.map((tArg) => concretizeType(tArg, subst, scope));

                assert(
                    forAll(concreteMems, (arg) => arg instanceof MemConstant),
                    `Unexpected non-concrete mem in {0}`,
                    n
                );

                assert(
                    forAll(concreteTs, (arg) => isConcrete(arg, scope)),
                    `Unexpected non-concrete type in {0}`,
                    n
                );

                const monoName = this.getMonoName(nDef, concreteMems as MemConstant[], concreteTs);
                return new FunctionCall(
                    n.src,
                    n.lhss.map(copy),
                    new Identifier(n.callee.src, monoName),
                    [],
                    [],
                    n.args.map(copy)
                );
            }

            return undefined;
        });
    }

    private concretizeDef(
        orig: StructDefinition | FunctionDefinition,
        newName: string,
        concreteMems: MemConstant[],
        concreteTypes: Type[]
    ): StructDefinition | FunctionDefinition {
        const subst: Substitution = [
            new Map(zip(orig.memoryParameters, concreteMems)),
            new Map(zip(orig.typeParameters, concreteTypes))
        ];
        const origScope = this.resolving.getScope(orig);

        if (orig instanceof StructDefinition) {
            return new StructDefinition(
                orig.src,
                [],
                [],
                newName,
                orig.fields.map(([name, type]) => [
                    name,
                    this.replacePolymorphicNodes(type, origScope, subst)
                ])
            );
        }

        return new FunctionDefinition(
            orig.src,
            [],
            [],
            newName,
            orig.parameters.map((param) => this.replacePolymorphicNodes(param, origScope, subst)),
            orig.locals.map((local) => this.replacePolymorphicNodes(local, origScope, subst)),
            orig.returns.map((retT) => this.replacePolymorphicNodes(retT, origScope, subst)),
            orig.body ? this.replacePolymorphicNodes(orig.body, origScope, subst) : undefined
        );
    }

    /**
     * Given a program p, and a map of *all* monomorphic variants need by `p`,
     * return a new program, with only monomorphic types/functions. We do this in 2 steps:
     *
     * 1. For all entries in the `monomorphicDefs` map, add the monomorphized instance to the new program
     * 2. For all non-polymorphic defs in the original program, copy them over, while replacing all references
     *  to polymorphic types inside them with their monomorphic variants.
     */
    private monomorphize(p: Program, monomorphicDefs: MonomorphicDefM): Program {
        const newProg: Program = [];

        // 1. For all entries in the `monomorphicDefs` map, add the monomorphized instance to the new program
        for (const [newName, [def, [concreteMems, concreteTypes]]] of monomorphicDefs) {
            newProg.push(this.concretizeDef(def, newName, concreteMems, concreteTypes));
        }

        // 2. For all non-polymorphic defs in the original program, copy them over, while replacing all references
        for (const def of p) {
            if (isDefPoly(def as TopLevelDef)) {
                continue;
            }

            const scope =
                def instanceof GlobalVariable
                    ? this.resolving.global
                    : this.resolving.getScope(def as StructDefinition | FunctionDefinition);

            newProg.push(
                this.replacePolymorphicNodes(def as TopLevelDef, scope, [new Map(), new Map()])
            );
        }

        return newProg;
    }

    run(): Program {
        const monomorphicDefs: MonomorphicDefM = this.accumulateMonomorphicVariants(this.program);

        return this.monomorphize(this.program, monomorphicDefs);
    }
}
