"""
Pandas Data Analysis Examples — PyCode Sample Project
Run this with F5 or `python examples/pandas_demo.py` in the terminal!
"""
import pandas as pd


def main():
    # ─── 1. Creating DataFrames ───────────────────────────────

    print("📊 Pandas Data Analysis Demo")
    print("=" * 40)

    # From a dictionary
    df = pd.DataFrame({
        'Name': ['Alice', 'Bob', 'Charlie', 'Diana', 'Eve'],
        'Age': [28, 34, 22, 45, 31],
        'City': ['New York', 'London', 'Tokyo', 'Paris', 'Sydney'],
        'Salary': [75000, 82000, 65000, 95000, 78000],
        'Department': ['Engineering', 'Marketing', 'Engineering', 'Management', 'Marketing'],
    })

    print("\n📋 Employee DataFrame:")
    print(df.to_string(index=False))

    # ─── 2. Basic Statistics ──────────────────────────────────

    print("\n📈 Summary Statistics:")
    print(f"  Average Age:    {df['Age'].mean():.1f}")
    print(f"  Average Salary: ${df['Salary'].mean():,.0f}")
    print(f"  Max Salary:     ${df['Salary'].max():,.0f}")
    print(f"  Min Salary:     ${df['Salary'].min():,.0f}")

    # ─── 3. Filtering & Sorting ───────────────────────────────

    print("\n🔍 Engineers (sorted by salary):")
    engineers = df[df['Department'] == 'Engineering'].sort_values('Salary', ascending=False)
    print(engineers[['Name', 'Salary']].to_string(index=False))

    # ─── 4. Group By ─────────────────────────────────────────

    print("\n📊 Average Salary by Department:")
    dept_stats = df.groupby('Department')['Salary'].agg(['mean', 'count'])
    dept_stats.columns = ['Avg Salary', 'Count']
    dept_stats['Avg Salary'] = dept_stats['Avg Salary'].map('${:,.0f}'.format)
    print(dept_stats.to_string())

    # ─── 5. Adding Computed Columns ───────────────────────────

    df['Tax (25%)'] = (df['Salary'] * 0.25).astype(int)
    df['Net Pay'] = df['Salary'] - df['Tax (25%)']

    print("\n💰 Salary Breakdown:")
    print(df[['Name', 'Salary', 'Tax (25%)', 'Net Pay']].to_string(index=False))

    # ─── 6. Pivot Table ───────────────────────────────────────

    sales_data = pd.DataFrame({
        'Quarter': ['Q1', 'Q2', 'Q3', 'Q4'] * 3,
        'Region': ['North'] * 4 + ['South'] * 4 + ['West'] * 4,
        'Revenue': [120, 150, 180, 200, 90, 110, 130, 160, 100, 140, 170, 190],
    })

    print("\n📊 Revenue Pivot Table:")
    pivot = sales_data.pivot_table(values='Revenue', index='Region', columns='Quarter', aggfunc='sum')
    pivot['Total'] = pivot.sum(axis=1)
    print(pivot.to_string())

    print("\n✅ Pandas demo complete!")


if __name__ == "__main__":
    main()
