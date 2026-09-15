import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'

type AdminTab = {
  value: string
  label: string
}

type AdminTabsProps = {
  activeTab: string
  tabs: AdminTab[]
  group: string
}

export function AdminTabs({ activeTab, tabs, group }: AdminTabsProps) {
  return (
    <Tabs
      defaultValue={activeTab}
      onValueChange={(value) => {
        window.dispatchEvent(new CustomEvent('freecoffee:admin-tab-change', { detail: { group, value } }))
      }}
      className="w-full gap-0"
    >
      <TabsList className="settings-tabs !h-auto w-full justify-start">
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            className="settings-tab h-auto flex-none px-[18px] py-[10px] data-[state=active]:bg-[var(--admin-panel)] data-[state=active]:shadow-[0_1px_3px_oklch(0.25_0_0_/_0.15)]"
          >
            {tab.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
