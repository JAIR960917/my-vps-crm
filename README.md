# CRM MyWay

**Versão: 1.0.2**

Sistema CRM brasileiro com Kanban, automação de WhatsApp e PWA.

## Changelog

### v1.0.2
- Implementado suporte a múltiplas instâncias WhatsApp
  - Nova tabela `whatsapp_instances` com controle por empresa
  - Campanhas e campanhas de gatilho agora vinculadas a instâncias específicas
  - Gerenciamento de instâncias via API Full (criar, resetar, reiniciar, QR Code, status)
  - Permissões RLS: admins acesso total, gerentes gerenciam instâncias da própria empresa

### v1.0.1
- Configuração inicial do CRM com Kanban, leads, formulários dinâmicos
- Integração WhatsApp via API Full
- Sistema de campanhas e campanhas por gatilho
- Notificações push (PWA)
- Gestão de usuários com roles (admin, vendedor, gerente)
