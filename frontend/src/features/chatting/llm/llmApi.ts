export type llmApi = {
    host: string,
    setHost: React.Dispatch<React.SetStateAction<string>>,
    modelName: string,
    setModelName: React.Dispatch<React.SetStateAction<string>>,
    apiToken: string,
    setApiToken: React.Dispatch<React.SetStateAction<string>>,
    isValid: boolean
}