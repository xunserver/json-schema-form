import type { ArrayView, GroupView, LayoutView, ObjectView } from "@form/core";
import type { LayoutBinding } from "@form/react";
import Accordion from "@mui/material/Accordion";
import AccordionDetails from "@mui/material/AccordionDetails";
import AccordionSummary from "@mui/material/AccordionSummary";
import Box from "@mui/material/Box";
import type { ReactNode } from "react";

export const objectLayout: LayoutBinding = {
  render(input) {
    return (
      <Box component="section" data-layout="object" data-path={(input.view as ObjectView).path}>
        {input.children as ReactNode}
      </Box>
    );
  },
};

export const arrayLayout: LayoutBinding = {
  render(input) {
    return (
      <Box component="section" data-layout="array" data-path={(input.view as ArrayView).path}>
        {input.children as ReactNode}
      </Box>
    );
  },
};

export const groupLayout: LayoutBinding = {
  collapsible: true,
  render(input) {
    const view = input.view as GroupView;
    return (
      <Accordion
        expanded={!input.viewSnapshot.collapsed}
        onChange={(_event, expanded) => {
          input.actions.setCollapsed(!expanded);
        }}
      >
        <AccordionSummary>{view.id}</AccordionSummary>
        <AccordionDetails>{input.children as ReactNode}</AccordionDetails>
      </Accordion>
    );
  },
};

export const gridLayout: LayoutBinding = {
  render(input) {
    const view = input.view as LayoutView;
    const columns = view.columns ?? 1;
    return (
      <Box
        data-layout="grid"
        sx={{
          display: "grid",
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gap: 2,
        }}
      >
        {input.children.map((child, index) => (
          <Box key={index} sx={view.span === undefined ? undefined : { gridColumn: `span ${view.span}` }}>
            {child}
          </Box>
        ))}
      </Box>
    );
  },
};

export const layoutBindings: Readonly<Record<string, LayoutBinding>> = Object.freeze({
  object: objectLayout,
  array: arrayLayout,
  group: groupLayout,
  layout: gridLayout,
});
