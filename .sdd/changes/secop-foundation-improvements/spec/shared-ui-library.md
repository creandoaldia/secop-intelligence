# Shared UI Library Specification

## Purpose

Provide reusable, accessible loading/empty/error UI components for consistent UX across pages.

## Requirements

### Requirement: PageHeader
MUST render title + optional description + optional action button.

| Prop | Type | Required |
|------|------|----------|
| title | string | yes |
| description | string | no |
| action | { label, onClick } | no |
| className | string | no |

#### Scenario: PageHeader renders fully
- GIVEN title="Process" and description="List of procesos"
- WHEN the component renders
- THEN the title is visible as `<h1>` and description as `<p>`

#### Scenario: Action button appears
- GIVEN action={ label: "Create", onClick: fn }
- WHEN the component renders
- THEN a `<button>` with label "Create" is shown

### Requirement: EmptyState
MUST render icon + message + optional action for empty data states.

#### Scenario: Default empty state
- GIVEN message="No records found"
- WHEN rendered
- THEN an icon and the message text are visible

#### Scenario: With action
- GIVEN action={ label: "Add", onClick: fn }
- WHEN rendered
- THEN the action button appears below the message

### Requirement: Skeleton
MUST render animated loading placeholders with configurable variants.

| Variant | Purpose |
|---------|---------|
| text | Single line placeholder |
| card | Card-shaped placeholder |
| table-row | Table row placeholder |

#### Scenario: Text skeleton
- GIVEN variant="text"
- THEN a pulsing gray bar of configurable width renders

### Requirement: ErrorMessage
MUST render error icon + message + optional retry button.

#### Scenario: Error display
- GIVEN message="Failed to load"
- WHEN rendered
- THEN a red-tinted box with error icon and message is visible
- THEN role="alert" is set

#### Scenario: With retry
- GIVEN onRetry={ fn }
- WHEN rendered
- THEN a "Retry" button calls onRetry on click

### Requirement: LoadingTable
MUST render a table skeleton with configurable rows and columns.

| Prop | Default |
|------|---------|
| rows | 5 |
| columns | 4 |

#### Scenario: Default table skeleton
- GIVEN default props
- THEN a `<table>`-like skeleton with 5 rows and 4 columns renders

### Requirement: LoadingCard
MUST render a grid of card skeletons with configurable count and columns.

| Prop | Default |
|------|---------|
| count | 6 |
| columns | 3 |

#### Scenario: Card grid skeleton
- GIVEN count=6, columns=3
- THEN a CSS grid with 3 columns renders 6 card-shaped placeholders

### Requirement: Accessibility
SHOULD include aria-labels and proper roles on all components.

#### Scenario: ARIA attributes present
- GIVEN any component renders
- THEN it includes `aria-label` or `role` where appropriate

### Requirement: Composability
MUST accept `className` prop for Tailwind extension.

#### Scenario: Custom className
- GIVEN className="mb-4"
- WHEN rendered
- THEN the className is forwarded to the root element
