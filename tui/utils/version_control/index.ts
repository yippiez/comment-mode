/**
 * @deprecated Use `tui/integrations/version_control/interface.ts` instead.
 * Re-export barrel for backward compatibility.
 */
export {
    detectVcsType,
    collectDiffInfo,
    getChangedFiles,
    type ChangedFile,
    type VcsType,
    type DiffInfo,
    type GitDiffInfo,
    type JjDiffInfo,
    isGitRepo,
    isJjRepo,
} from "../../integrations/version_control/interface";
