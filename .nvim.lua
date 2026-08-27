local root = vim.fs.root(0, { "tsconfig.json" }) or vim.fn.getcwd()

vim.lsp.config("tsgo", {
  cmd = {
    vim.fs.joinpath(root, "node_modules", ".bin", "tsc"),
    "--lsp",
    "--stdio",
  },
  root_dir = function(_, on_dir)
    on_dir(root)
  end,
  on_attach = function(client)
    client.server_capabilities.documentFormattingProvider = false
    client.server_capabilities.documentRangeFormattingProvider = false
  end,
})
vim.lsp.enable("tsgo")

vim.lsp.enable("biome")
