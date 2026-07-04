import * as React from "react";
import {
  Plus,
  Loader2,
  MoreVertical,
  Edit,
  Trash2,
  RefreshCw,
  LucideProps,
} from "lucide-react";

const iconMap = {
  plus: Plus,
  spinner: Loader2,
  moreVertical: MoreVertical,
  edit: Edit,
  trash: Trash2,
  refreshCw: RefreshCw,
};

type IconName = keyof typeof iconMap;

interface IconsProps extends LucideProps {
  name: IconName;
}

const IconsComponent = ({ name, ...props }: IconsProps) => {
  const Icon = iconMap[name];
  if (!Icon) return null;
  return <Icon {...props} />;
};

// Export both as a component (for <Icons name="..." />) and as static properties (for Icons.plus)
export const Icons = Object.assign(IconsComponent, iconMap);