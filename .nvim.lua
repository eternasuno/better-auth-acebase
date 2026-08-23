vim.lsp.config.ts_ls = {
  capabilities = {
    documentFormattingProvider = false,
    documentRangeFormattingProvider = false,
  },
}
vim.lsp.enable("ts_ls")

vim.lsp.enable("biome")
