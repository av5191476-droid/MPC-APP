export const httpError = (statusCode: number, message: string) => Object.assign(new Error(message), { statusCode });
