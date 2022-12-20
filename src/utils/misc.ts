import { MemDesc, MemVariableDeclaration, Type, TypeVariableDeclaration } from "../ir";

export function ppPolyParams(
    memArgs: MemVariableDeclaration[],
    typeArgs: TypeVariableDeclaration[]
): string {
    const memStr = memArgs.map((x) => x.pp()).join(", ");
    const typeStr = typeArgs.map((x) => x.pp()).join(", ");

    if (memStr === "" && typeStr === "") {
        return "";
    }

    if (memStr !== "" && typeStr !== "") {
        return `<${memStr}; ${typeStr}>`;
    }

    if (memStr !== "") {
        return `<${memStr}>`;
    }

    return `<;${typeStr}>`;
}

export function ppPolyArgs(memArgs: MemDesc[], typeArgs: Type[]): string {
    const memStr = memArgs.map((x) => x.pp()).join(", ");
    const typeStr = typeArgs.map((x) => x.pp()).join(", ");

    if (memStr === "" && typeStr === "") {
        return "";
    }

    if (memStr !== "" && typeStr !== "") {
        return `<${memStr}; ${typeStr}>`;
    }

    if (memStr !== "") {
        return `<${memStr}>`;
    }

    return `<;${typeStr}>`;
}
