import {
    Abort,
    AllocArray,
    AllocStruct,
    ArrayType,
    Assert,
    Assignment,
    BinaryOperation,
    BooleanLiteral,
    BoolType,
    Branch,
    Cast,
    Definition,
    Expression,
    FunctionCall,
    FunctionDefinition,
    Identifier,
    IntType,
    Jump,
    LoadField,
    LoadIndex,
    MemConstant,
    MemIdentifier,
    MemVariableDeclaration,
    Node,
    NumberLiteral,
    PointerType,
    Return,
    Statement,
    StoreField,
    StoreIndex,
    StructDefinition,
    TransactionCall,
    Type,
    TypeVariableDeclaration,
    UnaryOperation,
    UserDefinedType,
    VariableDeclaration
} from "../";
import { MIRError } from "../utils";
import { BasicBlock, CFG } from "./cfg";

export type PlainRepresentationHeader = {
    id: number;
    nodeType: string;
    src: string;
};

export type PlainRepresentation = PlainRepresentationHeader & { [key: string]: unknown };

export class MIRUnableToProducePlainRepresentation extends MIRError {
    constructor(public readonly node: Node) {
        super(`Unable to produce plain representation for node ${node.constructor.name}`);
    }
}

function header(node: Node): PlainRepresentationHeader {
    return {
        id: node.id,
        nodeType: node.constructor.name,
        src: node.src.pp()
    };
}

function bbToPlain(bb: BasicBlock): any {
    return {
        label: bb.label,
        statements: bb.statements.map(nodeToPlain),
        incoming: bb.incoming.map((edge) => ({
            from: edge.from.label,
            predicate: edge.predicate ? nodeToPlain(edge.predicate) : undefined
        })),
        outgoing: bb.outgoing.map((edge) => ({
            to: edge.to.label,
            predicate: edge.predicate ? nodeToPlain(edge.predicate) : undefined
        }))
    };
}

function cfgToPlain(cfg: CFG): any {
    const nodes: any[] = [];

    for (const bb of cfg.nodes.values()) {
        nodes.push(bbToPlain(bb));
    }

    return {
        entry: cfg.entry.label,
        nodes,
        exits: cfg.exits.map((bb) => bb.label)
    };
}

function defToPlain(node: Definition): PlainRepresentation {
    if (node instanceof FunctionDefinition) {
        return {
            ...header(node),

            name: node.name,
            memoryParameters: node.memoryParameters.map(nodeToPlain),
            typeParameters: node.typeParameters.map(nodeToPlain),
            parameters: node.parameters.map(nodeToPlain),
            locals: node.locals.map(nodeToPlain),
            body: node.body ? cfgToPlain(node.body) : undefined
        };
    }

    if (node instanceof StructDefinition) {
        return {
            ...header(node),

            name: node.name,
            memoryParameters: node.memoryParameters.map(nodeToPlain),
            typeParameters: node.typeParameters.map(nodeToPlain),
            fields: node.fields.map(([name, type]) => [name, nodeToPlain(type)])
        };
    }

    throw new MIRUnableToProducePlainRepresentation(node);
}

function exprToPlain(node: Expression): PlainRepresentation {
    if (node instanceof NumberLiteral) {
        return {
            ...header(node),

            value: node.value.toString(),
            radix: node.radix,
            type: nodeToPlain(node.type)
        };
    }

    if (node instanceof BooleanLiteral) {
        return {
            ...header(node),

            value: node.value
        };
    }

    if (node instanceof Cast) {
        return {
            ...header(node),

            toType: nodeToPlain(node.toType),
            subExpr: nodeToPlain(node.subExpr)
        };
    }

    if (node instanceof Identifier) {
        return {
            ...header(node),

            name: node.name
        };
    }

    if (node instanceof UnaryOperation) {
        return {
            ...header(node),

            op: node.op,
            subExpr: nodeToPlain(node.subExpr)
        };
    }

    if (node instanceof BinaryOperation) {
        return {
            ...header(node),

            op: node.op,
            leftExpr: nodeToPlain(node.leftExpr),
            rightExpr: nodeToPlain(node.rightExpr)
        };
    }

    throw new MIRUnableToProducePlainRepresentation(node);
}

function stmtToPlain(node: Statement): PlainRepresentation {
    if (node instanceof Abort) {
        return header(node);
    }

    if (node instanceof AllocArray) {
        return {
            ...header(node),

            lhs: nodeToPlain(node.lhs),
            type: nodeToPlain(node.type),
            size: nodeToPlain(node.size),
            mem: nodeToPlain(node.mem)
        };
    }

    if (node instanceof AllocStruct) {
        return {
            ...header(node),

            lhs: nodeToPlain(node.lhs),
            type: nodeToPlain(node.type),
            mem: nodeToPlain(node.mem)
        };
    }

    if (node instanceof Assert) {
        return {
            ...header(node),

            condition: nodeToPlain(node.condition)
        };
    }

    if (node instanceof Assignment) {
        return {
            ...header(node),

            lhs: nodeToPlain(node.lhs),
            rhs: nodeToPlain(node.rhs)
        };
    }

    if (node instanceof Branch) {
        return {
            ...header(node),

            condition: nodeToPlain(node.condition),
            trueLabel: node.trueLabel,
            falseLabel: node.falseLabel
        };
    }

    if (node instanceof FunctionCall) {
        return {
            ...header(node),

            lhss: node.lhss.map(nodeToPlain),
            callee: nodeToPlain(node.callee),
            memArgs: node.memArgs.map(nodeToPlain),
            typeArgs: node.typeArgs.map(nodeToPlain),
            args: node.args.map(nodeToPlain)
        };
    }

    if (node instanceof Jump) {
        return {
            ...header(node),

            label: node.label
        };
    }

    if (node instanceof LoadField) {
        return {
            ...header(node),

            lhs: nodeToPlain(node.lhs),
            baseExpr: nodeToPlain(node.baseExpr),
            member: node.member
        };
    }

    if (node instanceof LoadIndex) {
        return {
            ...header(node),

            lhs: nodeToPlain(node.lhs),
            baseExpr: nodeToPlain(node.baseExpr),
            indexExpr: nodeToPlain(node.indexExpr)
        };
    }

    if (node instanceof Return) {
        return {
            ...header(node),

            values: node.values.map(nodeToPlain)
        };
    }

    if (node instanceof StoreField) {
        return {
            ...header(node),

            baseExpr: nodeToPlain(node.baseExpr),
            member: node.member,
            rhs: nodeToPlain(node.rhs)
        };
    }

    if (node instanceof StoreIndex) {
        return {
            ...header(node),

            baseExpr: nodeToPlain(node.baseExpr),
            indexExpr: nodeToPlain(node.indexExpr),
            rhs: nodeToPlain(node.rhs)
        };
    }

    if (node instanceof TransactionCall) {
        return {
            ...header(node),

            lhss: node.lhss.map(nodeToPlain),
            callee: nodeToPlain(node.callee),
            memArgs: node.memArgs.map(nodeToPlain),
            typeArgs: node.typeArgs.map(nodeToPlain),
            args: node.args.map(nodeToPlain)
        };
    }

    throw new MIRUnableToProducePlainRepresentation(node);
}

function typeToPlain(node: Type): PlainRepresentation {
    if (node instanceof IntType) {
        return {
            ...header(node),

            signed: node.signed,
            nbits: node.nbits
        };
    }

    if (node instanceof BoolType) {
        return header(node);
    }

    if (node instanceof ArrayType) {
        return {
            ...header(node),

            baseType: nodeToPlain(node.baseType)
        };
    }

    if (node instanceof PointerType) {
        return {
            ...header(node),

            toType: nodeToPlain(node.toType),
            region: nodeToPlain(node.region)
        };
    }

    if (node instanceof UserDefinedType) {
        return {
            ...header(node),

            name: node.name,
            memArgs: node.memArgs.map(nodeToPlain),
            typeArgs: node.typeArgs.map(nodeToPlain)
        };
    }

    throw new MIRUnableToProducePlainRepresentation(node);
}

export function nodeToPlain(node: Node): PlainRepresentation {
    if (node instanceof Definition) {
        return defToPlain(node);
    }

    if (node instanceof Expression) {
        return exprToPlain(node);
    }

    if (node instanceof Statement) {
        return stmtToPlain(node);
    }

    if (node instanceof Type) {
        return typeToPlain(node);
    }

    if (node instanceof MemConstant) {
        return {
            ...header(node),

            name: node.name
        };
    }

    if (node instanceof MemIdentifier) {
        return {
            ...header(node),

            name: node.name,
            out: node.out
        };
    }

    if (node instanceof MemVariableDeclaration) {
        return {
            ...header(node),

            name: node.name,
            fresh: node.fresh
        };
    }

    if (node instanceof TypeVariableDeclaration) {
        return {
            ...header(node),

            name: node.name
        };
    }

    if (node instanceof VariableDeclaration) {
        return {
            ...header(node),

            name: node.name,
            type: nodeToPlain(node.type)
        };
    }

    throw new MIRUnableToProducePlainRepresentation(node);
}
