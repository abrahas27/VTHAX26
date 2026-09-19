from database import get_lakebase_connection

def get_student_profile(user_id: str):

    conn = get_lakebase_connection()

    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT
                u.display_name,
                p.major_code,
                p.class_year,
                p.parsed_skills,
                p.target_path_name
            FROM app.app_users u
            JOIN app.student_profiles p
                ON u.user_id = p.user_id
            WHERE u.user_id = %s
            """,
            (user_id,)
        )

        row = cur.fetchone()

    conn.close()

    return row