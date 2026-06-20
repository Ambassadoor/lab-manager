import { apiFetch } from "./client";
import type { Container } from "../types";

export const getContainers = (): Promise<Container[]| []> => {
    return apiFetch('/inventory/containers/')
}