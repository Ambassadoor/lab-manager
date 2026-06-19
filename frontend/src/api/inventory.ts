import { apiFetch } from "./client";

export const getContainers = () => {
    return apiFetch('/inventory/containers/')
}