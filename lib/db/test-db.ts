import type { DatabaseSync } from "node:sqlite";
import { openDatabase } from "./connection.ts";
import { DataError } from "./types";

/** A fresh in-memory database with all migrations applied. Tests use this and never open a file. */
export function memoryDb(): DatabaseSync {
  return openDatabase(":memory:");
}

/** Runs `fn` and returns the code of the DataError it throws; fails if it throws anything else or nothing. */
export function errorCode(fn: () => unknown): string {
  try {
    fn();
  } catch (error) {
    if (error instanceof DataError) return error.code;
    throw error;
  }
  throw new Error("Expected a DataError, but nothing was thrown.");
}
