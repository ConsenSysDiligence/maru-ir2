// @ts-nocheck

import { parse } from "path";
import {
    Definition,
    StructDefinition,
    IntType,
    BoolType,
    UserDefinedType,
    PointerType,
    ArrayType,
    FunctionDefinition,
    NumberLiteral,
    BooleanLiteral,
    Identifier,
    UnaryOperation,
    Expression,
    BinaryOperator,
    BinaryOperation,
    Assignment,
    Branch,
    LoadField,
    LoadIndex,
    StoreField,
    StoreIndex,
    Branch,
    Return,
    Statement,
    TerminatorStmt,
    Jump,
    VariableDeclaration
} from "../ir";
import { BasicBlock, CFG, Edge } from "../ir/cfg";
import { getOrErr } from "../utils";

export type PegsLoc = { offset: number; line: number; column: number };
export type PegsRange = { start: PegsLoc; end: PegsLoc };

type ParseOptions = {
    startRule: string;
    idCtr: number;
};

export function parseProgram(str: string): Array<Definition<PegsRange>> {
    try {
        return parse(str, { startRule: "Program", idCtr: 0 } as ParseOptions);
    } catch (e) {
        if (e instanceof SyntaxError) {
            console.error(e);
        }

        throw e;
    }
}

function getFreshId(opts: ParseOptions): number {
    return opts.idCtr++;
}

function buildBinaryExpression(
    head: Expression,
    tail: Array<[BinaryOperator, Expression, PegsRange]>,
    src: PegsRange,
    opts: ParseOptions
): SNode {
    return tail.reduce((acc, [curOp, curVal, curLoc]) => {
        const loc: PegsRange = { start: src.start, end: curLoc.end };
        return new BinaryOperation(getFreshId(opts), loc, acc, curOp, curVal);
    }, head);
}

/**
 * Build a `CFG` from a list of raw `Statement`s or pairs `[label, Statement]` parsed from a
 * .rsimp file.
 */
export function buildCFG(
    rawStmts: Array<Statement<PegsRange> | [string, Statement<PegsRange>]>,
    opts: ParseOptions,
    bodyLoc: PegsRange
): CFG<PegsRange> {
    // 1. Build basic blocks
    const nodes: Array<BasicBlock<PegsRange>> = [];
    const edges: Array<Edge<PegsRange>> = [];
    let entry: BasicBlock<PegsRange> | undefined;
    const exits: Array<BasicBlock<PegsRange>> = [];

    // For empty functions build a CFG with a single empty BB
    if (rawStmts.length === 0) {
        entry = new BasicBlock("entry");
        entry.statements.push(new Return(getFreshId(opts), bodyLoc, []));
        return new CFG([entry], [], entry, [entry]);
    }

    let curStmts: Array<Statement<PegsRange>> = [];
    let curLabel: string | undefined;
    const firstStmt = rawStmts[0];

    // We require all functions to start with a label.
    if (firstStmt instanceof Statement) {
        throw new Error(
            `Syntax error: ${firstStmt.src.start.line}:${firstStmt.src.start.column}: Expected first statement in function to be labeled.`
        );
    }

    const addBB = () => {
        const newBB = new BasicBlock<PegsRange>(curLabel as string);
        newBB.statements = curStmts;

        if (entry === undefined) {
            entry = newBB;
        }

        nodes.push(newBB);
    };

    // First split the list of statements into basic blocks
    for (const el of rawStmts) {
        if (el instanceof Statement) {
            curStmts.push(el);
        } else {
            if (curLabel !== undefined) {
                addBB();
            }

            curLabel = el[0];
            curStmts = [el[1]];
        }
    }

    // Add last BB
    addBB();

    // Find edges
    const bbMap = new Map<string, BasicBlock<PegsRange>>(nodes.map((n) => [n.label, n]));

    for (let i = 0; i < nodes.length; i++) {
        const bb = nodes[i];
        if (bb.statements.length === 0) {
            throw new Error(`Syntax error: Found empty basic block.`);
        }

        const lastStmt = bb.statements[bb.statements.length - 1];
        if (!(lastStmt instanceof TerminatorStmt)) {
            throw new Error(
                `Syntax error: ${lastStmt.src.start.line}:${
                    lastStmt.src.start.column
                }: Found basic block that ends in non-terminator statement ${lastStmt.pp()}.`
            );
        }

        if (lastStmt instanceof Return) {
            exits.push(bb);
            continue;
        }

        if (lastStmt instanceof Branch) {
            const trueBB = getOrErr(
                bbMap,
                lastStmt.trueLabel,
                `Error: Unknown basic block ${lastStmt.trueLabel}`
            );
            const falseBB = getOrErr(
                bbMap,
                lastStmt.falseLabel,
                `Error: Unknown basic block ${lastStmt.falseLabel}`
            );

            bb.addOutgoing(trueBB, lastStmt.condition);
            bb.addOutgoing(
                falseBB,
                new UnaryOperation(getFreshId(opts), lastStmt.condition.src, lastStmt.condition)
            );
            continue;
        }

        if (lastStmt instanceof Jump) {
            const destBB = getOrErr(
                bbMap,
                lastStmt.label,
                `Error: Unknown basic block ${lastStmt.falseLabel}`
            );

            bb.addOutgoing(destBB, new BooleanLiteral(getFreshId(opts), lastStmt.src, true));
            continue;
        }

        throw new Error(`Unknown terminator statement ${lastStmt.pp()}`);
    }

    return new CFG(nodes, edges, entry, exits);
}
