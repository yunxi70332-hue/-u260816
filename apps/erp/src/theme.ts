import type { ThemeConfig } from "antd";

export const ERP_THEME: ThemeConfig = {
  token: {
    colorPrimary: "#252927",
    colorInfo: "#3f708c",
    colorSuccess: "#2f7655",
    colorWarning: "#a06b20",
    colorError: "#ad4b43",
    colorText: "#242725",
    colorTextSecondary: "#666b68",
    colorBorder: "#d8dbd9",
    colorBorderSecondary: "#e7e9e8",
    colorBgLayout: "#ffffff",
    colorBgContainer: "#ffffff",
    borderRadius: 6,
    borderRadiusLG: 6,
    fontSize: 14,
    fontFamily: 'Inter, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif',
    controlHeight: 36,
    controlHeightSM: 30,
    boxShadowSecondary: "0 12px 32px rgba(24, 31, 28, 0.10)"
  },
  components: {
    Button: {
      fontWeight: 650,
      primaryShadow: "none"
    },
    Card: {
      headerFontSize: 15
    },
    Menu: {
      itemBorderRadius: 4,
      itemHeight: 42,
      itemBg: "#ffffff",
      itemColor: "#59615d",
      itemHoverBg: "#f5f6f5",
      itemHoverColor: "#242725",
      itemSelectedBg: "#fff3bf",
      itemSelectedColor: "#242725",
      darkItemBg: "#202321",
      darkSubMenuItemBg: "#202321",
      darkItemColor: "#b7bbb8",
      darkItemHoverBg: "#303331",
      darkItemSelectedBg: "#f0c94d",
      darkItemSelectedColor: "#202321"
    },
    Table: {
      headerBg: "#f5f7f6",
      headerColor: "#59625d",
      headerBorderRadius: 0,
      cellPaddingBlock: 12,
      cellPaddingInline: 14,
      rowHoverBg: "#fafbf9"
    },
    Tag: {
      defaultBg: "#f0f2f1",
      defaultColor: "#545d58"
    },
    Tabs: {
      itemSelectedColor: "#242725",
      inkBarColor: "#f0c94d"
    }
  }
};

export const ERP_LAYOUT_TOKEN = {
  header: {
    colorBgHeader: "#ffffff",
    colorHeaderTitle: "#242725",
    colorTextMenu: "#666b68",
    colorTextMenuSelected: "#242725",
    heightLayoutHeader: 64
  },
  sider: {
    colorMenuBackground: "#ffffff",
    colorTextMenu: "#59615d",
    colorTextMenuSelected: "#242725",
    colorTextMenuActive: "#242725",
    colorBgMenuItemSelected: "#fff3bf",
    colorBgMenuItemHover: "#f5f6f5"
  },
  pageContainer: {
    paddingInlinePageContainerContent: 24,
    paddingBlockPageContainerContent: 24
  }
};
